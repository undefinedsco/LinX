import * as fs from 'fs';
import * as path from 'path';
import { spawn, type ChildProcess } from 'node:child_process';
import kill from 'tree-kill';
import { app } from 'electron';
import { Supervisor } from '../../../../lib/supervisor';
import { ConfigManager } from './config-manager';
import { ProviderManager } from './provider-manager';
import {
  resolveManagedXpodLaunchTarget,
  type XpodLaunchProgress,
  type XpodLaunchTarget,
} from './xpod-launch';
import { desktopFetch } from './desktop-fetch';
import { ensureLinxLocalHome } from './local-home';
import buildMeta from '../generated/build-meta.json';

const OFFICIAL_CLOUD_IDENTITY_ORIGIN = 'https://id.undefineds.co';
const OFFICIAL_CLOUD_API_ORIGIN = 'https://api.undefineds.co';
const OFFICIAL_PREALLOCATED_MANAGED_SP_DOMAIN = 'node-0000.undefineds.co';
const MANAGED_CLOUD_REGISTRATION_TIMEOUT_MS = 30000;
const CANONICAL_OIDC_ISSUER_ENV_KEY = 'oidcIssuer';
const XPOD_LOCAL_SETUP_PATH_ENV_KEY = 'XPOD_LOCAL_SETUP_PATH';
const XPOD_PROVIDER_ID_ENV_KEY = 'XPOD_PROVIDER_ID';
const PROVISION_CODE_REFRESH_GRACE_SECONDS = 5 * 60;
const desktopBuildMeta = buildMeta as { xpodVersion?: string };

function isXpodDebugEnabled(): boolean {
  return process.env.LINX_XPOD_DEBUG === '1' || process.env.LINX_XPOD_DEBUG === 'true';
}

function debugXpodManager(message: string, payload?: Record<string, unknown>): void {
  if (!isXpodDebugEnabled()) {
    return;
  }

  if (payload) {
    safeConsoleLog(`[XpodManager:debug] ${message}`, payload);
  } else {
    safeConsoleLog(`[XpodManager:debug] ${message}`);
  }
}

function safeConsoleLog(...args: unknown[]): void {
  try {
    console.log(...args);
  } catch {
    // Logging must not crash the Electron main process if stdout is closed.
  }
}

function safeConsoleError(...args: unknown[]): void {
  try {
    console.error(...args);
  } catch {
    // Logging must not crash the Electron main process if stderr is closed.
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function readOidcIssuerEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string | undefined {
  const canonical = env[CANONICAL_OIDC_ISSUER_ENV_KEY]?.trim();
  return canonical || undefined;
}

function isOidcIssuerPollutionKey(key: string): boolean {
  if (key === CANONICAL_OIDC_ISSUER_ENV_KEY) return false;
  const normalized = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized.includes('OIDCISSUER') ||
    normalized.includes('IDPURL') ||
    normalized.includes('IDPJWKSURL') ||
    normalized.includes('IDENTITYPROVIDERURL') ||
    normalized.includes('IDENTITYPROVIDERJWKSURL');
}

function removeOidcIssuerEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): void {
  for (const key of Object.keys(env)) {
    if (key === CANONICAL_OIDC_ISSUER_ENV_KEY) delete env[key];
    if (isOidcIssuerPollutionKey(key)) {
      delete env[key];
    }
  }
}

function normalizeOidcIssuerEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): void {
  const oidcIssuer = readOidcIssuerEnv(env);
  removeOidcIssuerEnv(env);
  if (oidcIssuer) {
    env[CANONICAL_OIDC_ISSUER_ENV_KEY] = oidcIssuer;
  }
}

function getProvisionCodeExpirationSeconds(code: string): number | null {
  const dotIndex = code.indexOf('.');
  if (dotIndex <= 0) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(code.slice(0, dotIndex), 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

function isProvisionCodeReusable(code: string, nowMs = Date.now()): boolean {
  const expiresAt = getProvisionCodeExpirationSeconds(code);
  if (expiresAt === null) {
    // Older test/dev control planes used opaque codes. Only force refresh when
    // the current self-contained code format proves the code is stale.
    return true;
  }

  return expiresAt > Math.floor(nowMs / 1000) + PROVISION_CODE_REFRESH_GRACE_SECONDS;
}

function decodeProvisionCodePayload(code: string): Record<string, unknown> | null {
  const dotIndex = code.indexOf('.');
  if (dotIndex <= 0) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(code.slice(0, dotIndex), 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function normalizeUrlWithTrailingSlash(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url.toString().replace(/\/+$/, '') + '/';
  } catch {
    return value.trim().replace(/\/+$/, '') + '/';
  }
}

function isProvisionCodeScopedToCanonicalUrl(
  code: string,
  canonicalUrl: string | undefined,
  options?: { requireProof?: boolean },
): boolean {
  const payload = decodeProvisionCodePayload(code);
  if (!payload) {
    // Legacy/dev control planes used opaque provision codes. They cannot prove
    // scope, so registration reuse must be decided from the persisted Cloud
    // node record instead of forcing a fresh allocation on every startup.
    return true;
  }

  const expectedCanonicalUrl = normalizeUrlWithTrailingSlash(canonicalUrl);
  if (!expectedCanonicalUrl) {
    return options?.requireProof ? false : true;
  }

  const canonicalPayloadUrl = resolveProvisionPayloadCanonicalPublicUrl(payload);
  if (canonicalPayloadUrl) {
    return canonicalPayloadUrl === expectedCanonicalUrl;
  }

  return false;
}

function resolveProvisionPayloadCanonicalPublicUrl(payload: Record<string, unknown> | null): string | null {
  if (!payload) {
    return null;
  }

  const payloadSpDomain = typeof payload.spDomain === 'string' && payload.spDomain.trim()
    ? normalizeUrlWithTrailingSlash(`https://${payload.spDomain.trim()}`)
    : null;
  if (payloadSpDomain) {
    return payloadSpDomain;
  }

  const payloadSpUrl = typeof payload.spUrl === 'string'
    ? normalizeUrlWithTrailingSlash(payload.spUrl)
    : null;
  return payloadSpUrl;
}

function resolveRegistrationCanonicalPublicUrl(
  registration: Pick<XpodManagedCloudRegistration, 'provisionCode' | 'publicUrl' | 'spDomain'>,
  overridePublicUrl?: string,
): string | null {
  return normalizeUrlWithTrailingSlash(overridePublicUrl)
    ?? (registration.spDomain ? normalizeUrlWithTrailingSlash(`https://${registration.spDomain}`) : null)
    ?? normalizeUrlWithTrailingSlash(registration.publicUrl)
    ?? resolveProvisionPayloadCanonicalPublicUrl(decodeProvisionCodePayload(registration.provisionCode));
}

export interface XpodStartOptions {
  providerId: string;
  dataDir: string;
  port: number;
  spaceKind: 'local' | 'standalone';
  domain?: {
    type: 'none' | 'managed' | 'custom';
    value?: string;
  };
  tunnelToken?: string;
}

export type XpodStartProgressPhase =
  | 'resolve-runtime'
  | 'register-cloud'
  | 'prepare-data'
  | 'write-env'
  | 'spawn'
  | 'wait-ready'
  | 'ready'
  | XpodLaunchProgress['phase'];

export interface XpodStartProgress {
  phase: XpodStartProgressPhase;
  label: string;
  detail?: string | null;
}

export type XpodStartProgressHandler = (progress: XpodStartProgress) => void;

export interface XpodStatus {
  running: boolean;
  status?: 'starting' | 'running' | 'stopped' | 'error';
  providerId?: string;
  port?: number;
  baseUrl?: string;
  localUrl?: string;
  pid?: number;
  provisioning?: XpodProvisioningInfo;
  runtime?: XpodRuntimeInfo;
}

export interface XpodRuntimeInfo {
  launchKind?: string | null;
  currentVersion?: string | null;
  targetVersion?: string | null;
  upgradeAvailable: boolean;
}

export interface XpodProvisioningInfo {
  nodeId: string;
  publicUrl: string;
  provisionCode: string;
  provisionUrl: string;
  spDomain?: string;
  tunnelToken?: string;
  tunnelProvider?: string;
  tunnelEndpoint?: string;
  cloudIdentityUrl: string;
  cloudApiUrl: string;
  registeredAt: number;
}

interface XpodServiceState {
  providerId: string;
  dataDir: string;
  port: number;
  spaceKind: XpodStartOptions['spaceKind'];
  baseUrl: string;
  localUrl: string;
  startedAt: number;
  pid?: number;
  launchKind?: string;
  logPath?: string;
  errorLogPath?: string;
  runtimeId?: string;
  provisioning?: XpodManagedCloudRegistration;
}

interface XpodManagedCloudRegistration extends XpodProvisioningInfo {
  nodeToken: string;
  serviceToken: string;
}

interface ProvisionNodeRequest {
  publicUrl?: string;
  nodeId?: string;
  nodeToken?: string;
  serviceToken?: string;
  localPort?: number;
  tunnelToken?: string;
  // Cloud provisioning API fields, not LinX Local/Standalone runtime modes.
  tunnelMode?: 'client';
  domainMode?: 'managed' | 'self-managed';
  spDomain?: string;
}

interface ProvisionNodeResponse {
  nodeId?: string;
  nodeToken?: string;
  serviceToken?: string;
  provisionCode?: string;
  publicUrl?: string;
  spDomain?: string;
  tunnelToken?: string;
  tunnelProvider?: string;
  tunnelEndpoint?: string;
}

interface ProvisionStatusResponse {
  registered?: boolean;
  cloudUrl?: string;
  nodeId?: string;
  publicUrl?: string;
  spDomain?: string;
  provisionCode?: string;
  provisionUrl?: string;
}

export class XpodManager {
  private readonly configManager: ConfigManager;
  private readonly providerManager: ProviderManager;
  private readonly statePath: string;
  private readonly cloudRegistrationPath: string;
  private readonly runtimeEnvPath: string;
  private readonly logsDir: string;
  private readonly xpodRuntimeDir: string;
  private readonly desktopDir: string;
  private currentProviderId: string | null = null;
  private childProcess: ChildProcess | null = null;
  private stoppingPid: number | null = null;
  private lastProcessErrorOutput = '';
  private lastErrorLogPath: string | null = null;

  constructor(
    _supervisor: Supervisor,
    configManager: ConfigManager,
    providerManager: ProviderManager,
    baseDir?: string
  ) {
    const localPaths = ensureLinxLocalHome(baseDir);
    this.configManager = configManager;
    this.providerManager = providerManager;
    this.statePath = localPaths.stateFile;
    this.cloudRegistrationPath = path.join(localPaths.home, 'xpod-cloud-registration.json');
    this.runtimeEnvPath = localPaths.runtimeEnvFile;
    this.logsDir = localPaths.logsDir;
    this.xpodRuntimeDir = localPaths.xpodRuntimeDir;
    this.desktopDir = path.resolve(__dirname, '../../../..');
  }

  async start(options: XpodStartOptions, onProgress?: XpodStartProgressHandler): Promise<void> {
    const existing = this.readState();
    if (existing) {
      const existingHealthy = await this.isServiceReady(existing.localUrl);
      const existingProvisioning = existingHealthy && existing.providerId === options.providerId
        ? await this.readProvisioningFromRunningService({
            providerId: existing.providerId,
            localUrl: existing.localUrl,
            provisioning: existing.provisioning,
          })
        : existing.provisioning;
      if (
        existingHealthy
        && this.canFastReuseRunningService(existing, options, existingProvisioning)
      ) {
        this.reportStartProgress(onProgress, {
          phase: 'ready',
          label: '本地空间已运行',
          detail: existing.localUrl,
        });
        this.currentProviderId = existing.providerId;
        this.providerManager.updateManagedStatus(existing.providerId, 'running');
        return;
      }
    }

    this.reportStartProgress(onProgress, {
      phase: 'resolve-runtime',
      label: '检查本地空间运行环境',
      detail: null,
    });
    const preferredTarget = await this.resolvePreferredLaunchTarget(onProgress);
    this.reportStartProgress(onProgress, {
      phase: 'resolve-runtime',
      label: '本地空间运行环境已确定',
      detail: null,
    });
    if (this.requiresManagedCloudRegistration(options)) {
      this.reportStartProgress(onProgress, {
        phase: 'register-cloud',
        label: '准备账号绑定',
        detail: null,
      });
    }
    const persistedRegistration = this.readPersistedManagedCloudRegistration(options.providerId);
    const existingRegistration = existing?.providerId === options.providerId
      ? persistedRegistration ?? existing.provisioning
      : persistedRegistration;
    const provisioning = this.requiresManagedCloudRegistration(options)
      ? await this.ensureManagedCloudRegistration(options, existingRegistration)
      : undefined;
    if (provisioning) {
      this.persistManagedCloudRegistration(options.providerId, provisioning);
      this.reportStartProgress(onProgress, {
        phase: 'register-cloud',
        label: '账号绑定已完成',
        detail: null,
      });
    }
    const desiredState = this.createDesiredState(options, provisioning?.publicUrl);
    const runtimeEnv = this.buildServiceEnv(options, desiredState, provisioning);

    if (existing) {
      const existingHealthy = await this.isServiceReady(existing.localUrl);
      const existingProvisioning = existing.providerId === options.providerId
        ? this.readPersistedManagedCloudRegistration(options.providerId) ?? existing.provisioning
        : existing.provisioning;
      const comparableExisting = existingProvisioning && existing.spaceKind === 'local'
        ? {
            ...existing,
            baseUrl: existingProvisioning.publicUrl,
            provisioning: existingProvisioning,
          }
        : existing;
      if (
        existingHealthy
        && this.matchesDesiredState(comparableExisting, desiredState)
        && this.matchesProvisioning(comparableExisting.provisioning, provisioning)
        && this.matchesRuntimeEnvFile(runtimeEnv)
      ) {
        this.reportStartProgress(onProgress, {
          phase: 'ready',
          label: '本地空间已运行',
          detail: existing.localUrl,
        });
        this.currentProviderId = existing.providerId;
        this.providerManager.updateManagedStatus(existing.providerId, 'running');
        return;
      }

      if (this.childProcess || (existing.pid && this.isProcessAlive(existing.pid))) {
        await this.stop();
      } else {
        this.clearState();
      }
    }

    this.reportStartProgress(onProgress, {
      phase: 'prepare-data',
      label: '准备本地空间数据',
      detail: null,
    });
    fs.mkdirSync(desiredState.dataDir, { recursive: true });
    fs.mkdirSync(this.logsDir, { recursive: true });
    this.ensureEnvFileExists();

    this.currentProviderId = options.providerId;
    this.providerManager.updateManagedStatus(options.providerId, 'starting');
    this.lastProcessErrorOutput = '';
    this.lastErrorLogPath = null;
    let stderrPath: string | null = null;

    try {
      const target = preferredTarget;
      const stdoutPath = path.join(this.logsDir, 'xpod.out.log');
      stderrPath = path.join(this.logsDir, 'xpod.err.log');
      this.reportStartProgress(onProgress, {
        phase: 'write-env',
        label: '写入本地空间启动配置',
        detail: null,
      });
      const runtimeEnvPath = this.writeRuntimeEnvFile(runtimeEnv);
      runtimeEnv.XPOD_ENV_PATH = runtimeEnvPath;
      const launchSpec = this.buildLaunchSpec(target, desiredState.port, runtimeEnvPath);
      const spawnOptions = this.buildSpawnOptions(
        launchSpec.cwd,
        this.buildProcessEnv(target, runtimeEnv),
        stdoutPath,
        stderrPath,
      );
      debugXpodManager('spawning xpod', {
        command: launchSpec.command,
        args: launchSpec.args,
        cwd: launchSpec.cwd,
        envPath: runtimeEnvPath,
        launchKind: target.kind,
        runtimeId: this.buildRuntimeId(target),
        path: spawnOptions.env.PATH,
        nodeBinary: spawnOptions.env.XPOD_NODE_BINARY,
        electronRunAsNode: spawnOptions.env.ELECTRON_RUN_AS_NODE,
        nodeOptions: spawnOptions.env.NODE_OPTIONS,
      });
      let child: ChildProcess;

      try {
        this.reportStartProgress(onProgress, {
          phase: 'spawn',
          label: '启动本地空间',
          detail: null,
        });
        child = spawn(launchSpec.command, launchSpec.args, {
          ...spawnOptions,
        });
      } finally {
        fs.closeSync(spawnOptions.stdio[1]);
        fs.closeSync(spawnOptions.stdio[2]);
      }

      this.childProcess = child;
      this.stoppingPid = null;
      this.lastErrorLogPath = stderrPath;
      debugXpodManager('spawned xpod', { pid: child.pid });
      child.unref();
      this.attachProcessHandlers(child, options.providerId);

      this.writeState({
        ...desiredState,
        provisioning,
        startedAt: Date.now(),
        pid: child.pid,
        launchKind: target.kind,
        runtimeId: this.buildRuntimeId(target),
        logPath: stdoutPath,
        errorLogPath: stderrPath,
      });
      this.reportStartProgress(onProgress, {
        phase: 'wait-ready',
        label: '等待本地空间就绪',
        detail: null,
      });
      await this.waitForReady(
        desiredState.localUrl,
        child.pid,
        target.kind === 'dev-source' ? 90 : 30,
      );
      this.reportStartProgress(onProgress, {
        phase: 'ready',
        label: '本地空间已就绪',
        detail: null,
      });
      this.providerManager.updateManagedStatus(options.providerId, 'running');
    } catch (error) {
      debugXpodManager('xpod start failed before ready', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      this.lastProcessErrorOutput = this.readLogTail(stderrPath ?? this.lastErrorLogPath);
      const pid = this.childProcess?.pid;
      if (pid && this.isProcessAlive(pid)) {
        this.stoppingPid = pid;
        await this.killProcess(pid);
        await this.waitForShutdown(desiredState.localUrl);
      }
      this.childProcess = null;
      this.stoppingPid = null;
      this.clearState();
      this.currentProviderId = null;
      this.providerManager.updateManagedStatus(options.providerId, 'error');
      throw this.normalizeStartError(error, desiredState.port);
    }
  }

  async stop(): Promise<void> {
    const state = this.readState();
    const providerId = state?.providerId ?? this.currentProviderId;

    const pid = this.childProcess?.pid ?? state?.pid;

    if (pid && this.isProcessAlive(pid)) {
      this.stoppingPid = pid;
      this.childProcess = null;
      this.lastProcessErrorOutput = '';
      await this.killProcess(pid);
      if (state?.localUrl) {
        await this.waitForShutdown(state.localUrl);
      }
    }

    this.clearState();
    this.currentProviderId = null;
    this.stoppingPid = null;

    if (!providerId) {
      return;
    }

    try {
      this.providerManager.updateManagedStatus(providerId, 'stopped');
    } catch {
      // provider may have been removed
    }
  }

  async restart(): Promise<void> {
    const state = this.readState();
    const provider = state?.providerId
      ? this.providerManager.get(state.providerId)
      : this.currentProviderId
      ? this.providerManager.get(this.currentProviderId)
      : null;

    await this.stop();

    if (provider?.managed) {
      const spaceKind = state?.spaceKind ?? provider.managed.spaceKind;
      if (!spaceKind) {
        return;
      }

      await this.start({
        providerId: provider.id,
        dataDir: provider.managed.dataDir,
        port: provider.managed.port,
        spaceKind,
        domain: provider.managed.domain,
        tunnelToken: provider.managed.tunnelToken,
      });
    }
  }

  async upgradeRuntime(onProgress?: XpodStartProgressHandler): Promise<void> {
    const state = this.readState();
    const runtime = this.buildRuntimeInfo(state);
    if (!runtime.upgradeAvailable) {
      throw new Error('当前 xpod runtime 已是目标版本，无需升级。');
    }

    const options = this.getResumableStartOptions();
    if (!options) {
      throw new Error('无法找到可恢复的本地空间配置，不能升级 xpod runtime。');
    }

    await this.stop();
    await this.start(options, onProgress);
  }

  async getStatus(): Promise<XpodStatus> {
    const state = this.readState();
    if (!state) {
      const external = await this.detectExternalService();
      if (external) {
        return external;
      }

      return {
        running: false,
        status: 'stopped',
        runtime: this.buildRuntimeInfo(null),
      };
    }

    const runtime = this.buildRuntimeInfo(state);

    const healthy = await this.isServiceReady(state.localUrl);
    if (healthy) {
      this.currentProviderId = state.providerId;
      this.providerManager.updateManagedStatus(state.providerId, 'running');
      const provisioning = await this.readProvisioningFromRunningService({
        providerId: state.providerId,
        localUrl: state.localUrl,
        provisioning: state.provisioning,
      });
      return {
        running: true,
        status: 'running',
        providerId: state.providerId,
        port: state.port,
        baseUrl: provisioning?.publicUrl ?? state.baseUrl,
        localUrl: state.localUrl,
        pid: state.pid,
        provisioning: toProvisioningInfo(provisioning),
        runtime,
      };
    }

    if (this.childProcess || (state.pid && this.isProcessAlive(state.pid))) {
      this.currentProviderId = state.providerId;
      this.providerManager.updateManagedStatus(state.providerId, 'starting');
      return {
        running: false,
        status: 'starting',
        providerId: state.providerId,
        port: state.port,
        baseUrl: state.baseUrl,
        localUrl: state.localUrl,
        pid: state.pid,
        provisioning: toProvisioningInfo(state.provisioning),
        runtime,
      };
    }

    this.clearState();
    this.currentProviderId = null;

    try {
      this.providerManager.updateManagedStatus(state.providerId, 'stopped');
    } catch {
      // provider may have been removed
    }

    const external = await this.detectExternalService();
    if (external) {
      return external;
    }

    return {
      running: false,
      status: 'stopped',
      providerId: state.providerId,
      port: state.port,
      baseUrl: state.baseUrl,
      localUrl: state.localUrl,
      pid: state.pid,
      provisioning: toProvisioningInfo(state.provisioning),
      runtime,
    };
  }

  private async detectExternalService(): Promise<XpodStatus | null> {
    const candidates: Array<
      Required<Pick<XpodStatus, 'port' | 'baseUrl' | 'localUrl'>>
      & Pick<XpodStatus, 'providerId' | 'provisioning'>
    > = [];
    const seen = new Set<string>();

    const addCandidate = (candidate: {
      providerId?: string;
      port?: number;
      baseUrl?: string;
      localUrl?: string;
      provisioning?: XpodProvisioningInfo;
    }) => {
      const port = candidate.port;
      const localUrl = candidate.localUrl ? this.ensureTrailingSlash(candidate.localUrl) : null;
      const baseUrl = candidate.baseUrl ? this.ensureTrailingSlash(candidate.baseUrl) : null;

      if (!port || !localUrl || !baseUrl) {
        return;
      }

      if (seen.has(localUrl)) {
        return;
      }

      seen.add(localUrl);
      candidates.push({
        providerId: candidate.providerId,
        port,
        baseUrl,
        localUrl,
        provisioning: candidate.provisioning,
      });
    };

    for (const provider of this.providerManager.getManagedPods()) {
      if (!provider.managed) {
        continue;
      }

      const registration = this.readPersistedManagedCloudRegistration(provider.id);
      const providerBaseUrl = registration?.publicUrl ?? this.resolveProviderBaseUrl(provider.managed);
      if (provider.managed.spaceKind === 'local' && !registration && !provider.managed.domain.value) {
        continue;
      }

      addCandidate({
        providerId: provider.id,
        port: provider.managed.port,
        baseUrl: providerBaseUrl,
        localUrl: `http://localhost:${provider.managed.port}/`,
        provisioning: toProvisioningInfo(registration),
      });
    }

    for (const candidate of candidates) {
      const healthy = await this.isServiceReady(candidate.localUrl);
      if (!healthy) {
        continue;
      }

      if (candidate.providerId) {
        this.currentProviderId = candidate.providerId;
        try {
          this.providerManager.updateManagedStatus(candidate.providerId, 'running');
        } catch {
          // provider may have been removed
        }
      }

      const provisioning = candidate.providerId
        ? await this.readProvisioningFromRunningService({
            providerId: candidate.providerId,
            localUrl: candidate.localUrl,
          })
        : undefined;

      return {
        running: true,
        status: 'running',
        providerId: candidate.providerId,
        port: candidate.port,
        baseUrl: provisioning?.publicUrl ?? candidate.baseUrl,
        localUrl: candidate.localUrl,
        provisioning: toProvisioningInfo(provisioning) ?? candidate.provisioning,
        runtime: this.buildRuntimeInfo(null),
      };
    }

    return null;
  }

  async healthCheck(): Promise<boolean> {
    const state = this.readState();
    if (!state) {
      const external = await this.detectExternalService();
      return Boolean(external?.running);
    }

    return this.isServiceReady(state.localUrl);
  }

  getLogPaths(): { directory: string; stdout: string; stderr: string } {
    return {
      directory: this.logsDir,
      stdout: path.join(this.logsDir, 'xpod.out.log'),
      stderr: path.join(this.logsDir, 'xpod.err.log'),
    };
  }

  getResumableStartOptions(): XpodStartOptions | null {
    const state = this.readState();
    const fromState = state?.providerId ? this.providerManager.get(state.providerId) : null;
    if (fromState?.managed && state?.spaceKind) {
      return toStartOptions(fromState, state.spaceKind);
    }

    const defaultProvider = this.providerManager.getDefault();
    if (defaultProvider?.managed?.spaceKind) {
      return toStartOptions(defaultProvider);
    }

    const firstManagedProvider = this.providerManager.getManagedPods()[0];
    if (firstManagedProvider?.managed?.spaceKind) {
      return toStartOptions(firstManagedProvider);
    }

    return null;
  }

  async resume(): Promise<boolean> {
    const options = this.getResumableStartOptions();
    if (!options) {
      return false;
    }

    await this.start(options);
    return true;
  }

  async prepareLocalAuthorizationUrl(rawUrl: string): Promise<string> {
    const requestedProvisionCode = extractProvisionCodeFromUrl(rawUrl);
    const state = this.readState();
    const persistedProvisioning = state?.providerId
      ? this.readPersistedManagedCloudRegistration(state.providerId)
      : undefined;
    const stateProvisionCode = state?.spaceKind === 'local'
      ? (persistedProvisioning ?? state.provisioning)?.provisionCode
      : undefined;
    const shouldRefresh = Boolean(
      (requestedProvisionCode && !isProvisionCodeReusable(requestedProvisionCode))
      || (
        stateProvisionCode
        && !isProvisionCodeReusable(stateProvisionCode)
        && (!requestedProvisionCode || requestedProvisionCode === stateProvisionCode)
      ),
    );

    if (!shouldRefresh) {
      return rawUrl;
    }

    const options = this.getResumableStartOptions();
    if (!options || options.spaceKind !== 'local') {
      return rawUrl;
    }

    await this.start(options);
    const freshProvisionCode = this.readPersistedManagedCloudRegistration(options.providerId)?.provisionCode
      ?? this.readState()?.provisioning?.provisionCode;
    if (!freshProvisionCode) {
      return rawUrl;
    }

    return replaceProvisionCodeInUrl(rawUrl, freshProvisionCode);
  }

  private createDesiredState(
    options: XpodStartOptions,
    publicBaseUrl?: string,
  ): Omit<XpodServiceState, 'startedAt' | 'pid' | 'launchKind' | 'logPath' | 'errorLogPath' | 'runtimeId'> {
    const baseUrl = publicBaseUrl ? this.ensureTrailingSlash(publicBaseUrl) : this.resolvePublicBaseUrl(options);
    return {
      providerId: options.providerId,
      dataDir: path.resolve(options.dataDir),
      port: options.port,
      spaceKind: options.spaceKind,
      baseUrl,
      localUrl: this.ensureTrailingSlash(`http://localhost:${options.port}`),
      provisioning: undefined,
    };
  }

  private resolvePublicBaseUrl(options: XpodStartOptions): string {
    if (options.domain?.value) {
      return this.ensureTrailingSlash(`https://${options.domain.value}`);
    }

    const localBaseUrl = this.resolveConfiguredLocalBaseUrl();
    if (localBaseUrl) {
      return localBaseUrl;
    }

    return this.ensureTrailingSlash(`http://localhost:${options.port}`);
  }

  private resolveProviderBaseUrl(managed: NonNullable<ReturnType<ProviderManager['getManagedPods']>[number]['managed']>): string {
    if (managed.domain.value) {
      return this.ensureTrailingSlash(`https://${managed.domain.value}`);
    }

    const localBaseUrl = this.resolveConfiguredLocalBaseUrl();
    if (localBaseUrl) {
      return localBaseUrl;
    }

    return this.ensureTrailingSlash(`http://localhost:${managed.port}`);
  }

  private resolveConfiguredLocalBaseUrl(): string | null {
    const configured = this.configManager.getAll().CSS_BASE_URL?.trim();
    if (!configured) {
      return null;
    }

    try {
      const parsed = new URL(configured);
      if (parsed.protocol !== 'http:') {
        return null;
      }
      return this.ensureTrailingSlash(parsed.toString());
    } catch {
      return null;
    }
  }

  private buildLaunchSpec(
    target: XpodLaunchTarget,
    port: number,
    envPath: string,
  ): { command: string; args: string[]; cwd: string } {
    const configPath = path.join(this.resolveXpodPackageRoot(target), 'config', 'local.json');
    const sharedArgs = [
      '--config',
      configPath,
      '--env',
      envPath,
      '--port',
      String(port),
    ];

    switch (target.kind) {
      case 'dev-source':
        return {
          command: target.runtimeBinary ?? process.env.LINX_BUN_BINARY ?? process.env.LINX_XPOD_BUN_BINARY ?? 'bun',
          args: ['--no-env-file', target.entryPath, ...sharedArgs],
          cwd: target.rootDir,
        };
      case 'dev-dist':
        return {
          command: process.env.XPOD_NODE_BINARY ?? 'node',
          args: [target.entryPath, ...sharedArgs],
          cwd: target.rootDir,
        };
      case 'managed-bun-package':
        return {
          command: target.runtimeBinary ?? process.env.LINX_BUN_BINARY ?? process.env.LINX_XPOD_BUN_BINARY ?? 'bun',
          args: [target.entryPath, 'start', ...sharedArgs],
          cwd: target.rootDir,
        };
      case 'managed-node-package':
        return {
          command: target.runtimeBinary ?? process.env.XPOD_NODE_BINARY ?? process.env.LINX_NODE_BINARY ?? 'node',
          args: [target.entryPath, 'start', ...sharedArgs],
          cwd: target.rootDir,
        };
      case 'single-file':
        return {
          command: process.env.XPOD_NODE_BINARY ?? 'node',
          args: [target.entryPath, ...sharedArgs],
          cwd: target.rootDir,
        };
      case 'package-bin':
        return {
          command: process.env.XPOD_NODE_BINARY ?? 'node',
          args: [target.entryPath, 'start', ...sharedArgs],
          cwd: target.rootDir,
        };
      default:
        throw new Error(`Unsupported xpod launch target: ${String(target)}`);
    }
  }

  private resolveXpodPackageRoot(target: XpodLaunchTarget): string {
    if (target.kind === 'managed-bun-package' || target.kind === 'managed-node-package') {
      return path.resolve(path.dirname(target.entryPath), '..');
    }

    return target.rootDir;
  }

  private buildProcessEnv(
    target: XpodLaunchTarget,
    runtimeEnvOrOptions: Record<string, string> | XpodStartOptions,
    state?: Omit<XpodServiceState, 'startedAt' | 'pid' | 'launchKind' | 'logPath' | 'errorLogPath' | 'runtimeId'>,
    provisioning?: XpodManagedCloudRegistration,
  ): NodeJS.ProcessEnv {
    const runtimeEnv = state
      ? this.buildServiceEnv(
          runtimeEnvOrOptions as XpodStartOptions,
          state,
          provisioning,
        )
      : (runtimeEnvOrOptions as Record<string, string>)
    const inheritedEnv: NodeJS.ProcessEnv = { ...process.env };
    removeOidcIssuerEnv(inheritedEnv);

    const env: NodeJS.ProcessEnv = {
      ...inheritedEnv,
      ...runtimeEnv,
    };
    normalizeOidcIssuerEnv(env);

    const nodePathEntries = new Set<string>();
    const existingNodePath = env.NODE_PATH;
    if (existingNodePath) {
      for (const entry of existingNodePath.split(path.delimiter)) {
        if (entry) {
          nodePathEntries.add(entry);
        }
      }
    }

    const candidateNodeModules = [
      path.join(target.rootDir, 'node_modules'),
      path.resolve(process.cwd(), 'node_modules'),
      path.resolve(process.cwd(), '../node_modules'),
      path.resolve(process.cwd(), '../../node_modules'),
    ];

    for (const candidate of candidateNodeModules) {
      if (fs.existsSync(candidate)) {
        nodePathEntries.add(candidate);
      }
    }

    if (nodePathEntries.size > 0) {
      env.NODE_PATH = Array.from(nodePathEntries).join(path.delimiter);
    }

    return env;
  }

  private writeRuntimeEnvFile(runtimeEnv: Record<string, string>): string {
    fs.mkdirSync(path.dirname(this.runtimeEnvPath), { recursive: true });
    fs.writeFileSync(this.runtimeEnvPath, this.serializeEnvFile(runtimeEnv), 'utf-8');
    return this.runtimeEnvPath;
  }

  private ensureEnvFileExists(): void {
    const envPath = this.configManager.getConfigPath();
    if (fs.existsSync(envPath)) {
      return;
    }

    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, this.serializeEnvFile(this.configManager.getAll()), 'utf-8');
  }

  private serializeEnvFile(config: Record<string, string | undefined>): string {
    const lines = ['# Generated by LinX Desktop', ''];

    for (const [key, value] of Object.entries(config)) {
      if (typeof value !== 'string') {
        continue;
      }

      lines.push(`${key}=${value}`);
    }

    lines.push('');
    return lines.join('\n');
  }

  private attachProcessHandlers(child: ChildProcess, providerId: string): void {
    child.on('error', (error) => {
      safeConsoleError('[XpodManager] Failed to spawn xpod:', error);
      if (this.childProcess?.pid === child.pid) {
        this.childProcess = null;
      }
      try {
        this.providerManager.updateManagedStatus(providerId, 'error');
      } catch {
        // provider may have been removed
      }
    });

    child.on('exit', (code, signal) => {
      safeConsoleLog(`[XpodManager] xpod exited with code ${code} signal ${signal}`);
      const wasIntentionalStop = this.stoppingPid === child.pid;

      if (this.childProcess?.pid === child.pid) {
        this.childProcess = null;
      }

      const state = this.readState();
      if (state?.pid === child.pid) {
        this.clearState();
      }

      if (wasIntentionalStop) {
        this.stoppingPid = null;
        return;
      }

      if (this.currentProviderId === providerId) {
        this.currentProviderId = null;
      }

      try {
        this.providerManager.updateManagedStatus(providerId, code === 0 ? 'stopped' : 'error');
      } catch {
        // provider may have been removed
      }
    });
  }

  private buildSpawnOptions(
    cwd: string,
    env: NodeJS.ProcessEnv,
    stdoutPath: string,
    stderrPath: string,
  ): {
    cwd: string;
    env: NodeJS.ProcessEnv;
    detached: true;
    windowsHide: true;
    stdio: ['ignore', number, number];
  } {
    const stdoutFd = fs.openSync(stdoutPath, 'a');
    const stderrFd = fs.openSync(stderrPath, 'a');

    return {
      cwd,
      env,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', stdoutFd, stderrFd],
    };
  }

  private buildServiceEnv(
    options: XpodStartOptions,
    state: Omit<XpodServiceState, 'startedAt' | 'pid' | 'launchKind' | 'logPath' | 'errorLogPath' | 'runtimeId'>,
    provisioning?: XpodManagedCloudRegistration,
  ): Record<string, string> {
    const envConfig = this.configManager.getAll();
    const identityDbUrl = toSqliteUrl(path.join(state.dataDir, 'identity.sqlite'));
    const usageDbUrl = toSqliteUrl(path.join(state.dataDir, 'usage.sqlite'));
    const sparqlEndpoint = toSqliteUrl(path.join(state.dataDir, 'quadstore.sqlite'));

    const env: Record<string, string> = {
      NODE_ENV: 'production',
      ...envConfig,
      XPOD_PORT: String(state.port),
      PORT: String(state.port),
      [XPOD_LOCAL_SETUP_PATH_ENV_KEY]: this.cloudRegistrationPath,
      [XPOD_PROVIDER_ID_ENV_KEY]: options.providerId,
      CSS_EDITION: envConfig.CSS_EDITION ?? 'local',
      edition: envConfig.CSS_EDITION ?? 'local',
      edgeNodesEnabled: envConfig.CSS_EDGE_NODES_ENABLED ?? 'false',
      CSS_BASE_URL: state.baseUrl,
      CSS_ROOT_FILE_PATH: state.dataDir,
      CSS_IDENTITY_DB_URL: identityDbUrl,
      DATABASE_URL: identityDbUrl,
      CSS_SPARQL_ENDPOINT: sparqlEndpoint,
      identityDbUrl,
      usageDbUrl,
      sparqlEndpoint,
      SPARQL_ENDPOINT: sparqlEndpoint,
    };

    if (this.requiresManagedCloudRegistration(options)) {
      const managedCloudIdentityOrigin = normalizeUrl(
        readOidcIssuerEnv(env)
        || OFFICIAL_CLOUD_IDENTITY_ORIGIN,
      );
      const managedCloudApiOrigin = normalizeUrl(
        env.XPOD_CLOUD_API_ENDPOINT
        || OFFICIAL_CLOUD_API_ORIGIN,
      );

      env.oidcIssuer = managedCloudIdentityOrigin;
      env.XPOD_CLOUD_API_ENDPOINT = managedCloudApiOrigin;
      normalizeOidcIssuerEnv(env);
    } else {
      removeOidcIssuerEnv(env);
      delete env.XPOD_CLOUD_API_ENDPOINT;
    }

    if (provisioning) {
      env.XPOD_NODE_ID = provisioning.nodeId;
      env.XPOD_NODE_TOKEN = provisioning.nodeToken;
      env.XPOD_SERVICE_TOKEN = provisioning.serviceToken;
      env.XPOD_PROVISION_CODE = provisioning.provisionCode;
      env.XPOD_PROVISION_URL = provisioning.provisionUrl;
      if (provisioning.spDomain) {
        env.XPOD_SP_DOMAIN = provisioning.spDomain;
      } else {
        delete env.XPOD_SP_DOMAIN;
      }
    } else {
      delete env.XPOD_NODE_ID;
      delete env.XPOD_NODE_TOKEN;
      delete env.XPOD_SERVICE_TOKEN;
      delete env.XPOD_PROVISION_CODE;
      delete env.XPOD_PROVISION_URL;
      delete env.XPOD_SP_DOMAIN;
    }

    const effectiveTunnelToken = options.spaceKind === 'local'
      ? options.tunnelToken || provisioning?.tunnelToken
      : undefined;
    if (effectiveTunnelToken) {
      env.CLOUDFLARE_TUNNEL_TOKEN = effectiveTunnelToken;
    } else {
      delete env.CLOUDFLARE_TUNNEL_TOKEN;
      delete env.LINX_TUNNEL_PROVIDER;
    }

    return env;
  }

  private requiresManagedCloudRegistration(options: XpodStartOptions): boolean {
    return options.spaceKind === 'local';
  }

  private async ensureManagedCloudRegistration(
    options: XpodStartOptions,
    existing: XpodManagedCloudRegistration | undefined,
  ): Promise<XpodManagedCloudRegistration> {
    const env = this.configManager.getAll();
    const cloudIdentityUrl = normalizeUrl(
      readOidcIssuerEnv(env)
      || OFFICIAL_CLOUD_IDENTITY_ORIGIN,
    );
    const managedCloudApiOrigin = normalizeUrl(
      env.XPOD_CLOUD_API_ENDPOINT
      || OFFICIAL_CLOUD_API_ORIGIN,
    );
    const configuredPublicUrl = this.resolveConfiguredProvisionPublicUrl(options);
    const configuredManagedSpDomain = this.resolveConfiguredManagedSpDomain(options);
    const configuredManagedPublicUrl = derivePublicUrlFromSpDomain(configuredManagedSpDomain);
    const explicitlyClearedManagedDomain = isExplicitlyClearedManagedDomain(options);
    const existingManagedSpDomain = explicitlyClearedManagedDomain
      ? undefined
      : normalizedExistingSpDomain(existing);
    const existingManagedPublicUrl = derivePublicUrlFromSpDomain(existingManagedSpDomain);
    const existingCanonicalPublicUrl = existing
      ? resolveRegistrationCanonicalPublicUrl(existing, configuredPublicUrl)
      : null;
    const normalizedExisting = existing && existingCanonicalPublicUrl
      ? {
          ...existing,
          publicUrl: existingCanonicalPublicUrl,
          provisionUrl: buildProvisionUrl(cloudIdentityUrl, existing.provisionCode),
        }
      : existing;
    const expectedPublicUrl = configuredPublicUrl
      ?? configuredManagedPublicUrl
      ?? existingManagedPublicUrl
      ?? existingCanonicalPublicUrl
      ?? undefined;
    const canReuseExistingRegistration = canReuseManagedCloudRegistration(
      normalizedExisting,
      {
        configuredPublicUrl,
        configuredManagedPublicUrl,
        configuredManagedSpDomain,
        explicitlyClearedManagedDomain,
        expectedPublicUrl,
      },
    );

    if (
      normalizedExisting
      && normalizedExisting.cloudApiUrl === managedCloudApiOrigin
      && normalizedExisting.cloudIdentityUrl === cloudIdentityUrl
      && canReuseExistingRegistration
      && normalizedExisting.nodeId
      && normalizedExisting.nodeToken
      && normalizedExisting.serviceToken
      && normalizedExisting.provisionCode
      && isProvisionCodeReusable(normalizedExisting.provisionCode)
      && isProvisionCodeScopedToCanonicalUrl(normalizedExisting.provisionCode, expectedPublicUrl, { requireProof: true })
    ) {
      return {
        ...normalizedExisting,
        tunnelToken: options.tunnelToken || normalizedExisting.tunnelToken,
      };
    }

    const provisionRequest = this.buildProvisionNodeRequest(options, {
      publicUrl: configuredPublicUrl,
      nodeId: normalizedExisting?.nodeId,
      nodeToken: normalizedExisting?.nodeToken,
      serviceToken: normalizedExisting?.serviceToken,
      spDomain: configuredManagedSpDomain ?? existingManagedSpDomain,
      tunnelToken: options.tunnelToken || normalizedExisting?.tunnelToken,
    });
    let effectiveProvisionRequest = provisionRequest;
    let registration: Awaited<ReturnType<XpodManager['registerProvisionedNode']>>;
    try {
      registration = await this.registerProvisionedNode(managedCloudApiOrigin, {
        ...effectiveProvisionRequest,
        localPort: options.port,
      });
    } catch (error) {
      const fallbackRequest = this.buildManagedPublicUrlFallbackRequest(
        effectiveProvisionRequest,
        managedCloudApiOrigin,
      );
      if (!fallbackRequest || !isManagedProvisionFallbackError(error)) {
        throw error;
      }

      effectiveProvisionRequest = fallbackRequest;
      registration = await this.registerProvisionedNode(managedCloudApiOrigin, {
        ...effectiveProvisionRequest,
        localPort: options.port,
      });
    }
    const spDomain = registration.spDomain ?? effectiveProvisionRequest.spDomain;
    const publicUrl = resolveRegistrationCanonicalPublicUrl({
      provisionCode: registration.provisionCode,
      publicUrl: registration.publicUrl ?? effectiveProvisionRequest.publicUrl ?? '',
      spDomain,
    }, configuredPublicUrl) ?? registration.publicUrl ?? effectiveProvisionRequest.publicUrl;

    if (!publicUrl) {
      throw new Error('本地空间还没拿到可登录地址。请稍后重试。');
    }

    return {
      nodeId: registration.nodeId,
      nodeToken: registration.nodeToken,
      serviceToken: registration.serviceToken,
      provisionCode: registration.provisionCode,
      publicUrl,
      spDomain,
      tunnelToken: registration.tunnelToken ?? effectiveProvisionRequest.tunnelToken,
      tunnelProvider: registration.tunnelProvider,
      tunnelEndpoint: registration.tunnelEndpoint,
      provisionUrl: buildProvisionUrl(cloudIdentityUrl, registration.provisionCode),
      cloudIdentityUrl,
      cloudApiUrl: managedCloudApiOrigin,
      registeredAt: Date.now(),
    };
  }

  private resolveConfiguredProvisionPublicUrl(options: XpodStartOptions): string | undefined {
    if (options.domain?.type === 'custom' && options.domain.value?.trim()) {
      return this.ensureTrailingSlash(`https://${options.domain.value}`);
    }

    return undefined;
  }

  private resolveConfiguredManagedSpDomain(options: XpodStartOptions): string | undefined {
    if (options.domain?.type !== 'managed' || !options.domain.value?.trim()) {
      return undefined;
    }

    return normalizeHostname(options.domain.value);
  }

  private async registerProvisionedNode(
    cloudApiUrl: string,
    request: ProvisionNodeRequest,
  ): Promise<
    Required<Pick<XpodManagedCloudRegistration, 'nodeId' | 'nodeToken' | 'serviceToken' | 'provisionCode'>>
    & Pick<XpodManagedCloudRegistration, 'spDomain' | 'tunnelToken' | 'tunnelProvider' | 'tunnelEndpoint'>
    & { publicUrl?: string }
  > {
    const endpoint = new URL('/provision/nodes', this.ensureTrailingSlash(cloudApiUrl)).toString();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MANAGED_CLOUD_REGISTRATION_TIMEOUT_MS);

    try {
      const response = await desktopFetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail || `HTTP ${response.status}`);
      }

      const payload = await response.json() as ProvisionNodeResponse;
      if (
        typeof payload.nodeId !== 'string'
        || typeof payload.nodeToken !== 'string'
        || typeof payload.serviceToken !== 'string'
        || typeof payload.provisionCode !== 'string'
      ) {
        throw new Error('Cloud 返回的节点注册结果不完整。');
      }

      return {
        nodeId: payload.nodeId,
        nodeToken: payload.nodeToken,
        serviceToken: payload.serviceToken,
        provisionCode: payload.provisionCode,
        publicUrl: typeof payload.publicUrl === 'string' ? this.ensureTrailingSlash(payload.publicUrl) : undefined,
        spDomain: typeof payload.spDomain === 'string' ? payload.spDomain : undefined,
        tunnelToken: typeof payload.tunnelToken === 'string' ? payload.tunnelToken : undefined,
        tunnelProvider: typeof payload.tunnelProvider === 'string' ? payload.tunnelProvider : undefined,
        tunnelEndpoint: typeof payload.tunnelEndpoint === 'string' ? payload.tunnelEndpoint : undefined,
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error('连接登录服务超时。请检查网络后重试。');
      }
      safeConsoleError('[XpodManager] Failed to register Local node with Cloud:', error);
      throw createManagedCloudRegistrationError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildProvisionNodeRequest(
    options: XpodStartOptions,
    fields: Omit<ProvisionNodeRequest, 'localPort' | 'domainMode' | 'tunnelMode'>,
  ): Omit<ProvisionNodeRequest, 'localPort'> {
    if (options.domain?.type === 'custom' && options.domain.value?.trim()) {
      return {
        ...fields,
        publicUrl: this.ensureTrailingSlash(`https://${options.domain.value}`),
        domainMode: 'self-managed',
        spDomain: undefined,
        tunnelMode: fields.tunnelToken ? 'client' : undefined,
      };
    }

    return {
      ...fields,
      domainMode: 'managed',
      tunnelMode: fields.tunnelToken ? 'client' : undefined,
    };
  }

  private buildManagedPublicUrlFallbackRequest(
    request: Omit<ProvisionNodeRequest, 'localPort'>,
    cloudApiUrl: string,
  ): Omit<ProvisionNodeRequest, 'localPort'> | null {
    if (request.domainMode !== 'managed' || request.publicUrl) {
      return null;
    }

    const spDomain = (request.spDomain
      ? normalizeHostname(request.spDomain)
      : undefined)
      ?? (isOfficialCloudApiOrigin(cloudApiUrl) ? OFFICIAL_PREALLOCATED_MANAGED_SP_DOMAIN : undefined);

    if (!spDomain) {
      return null;
    }

    return {
      ...request,
      domainMode: 'self-managed',
      spDomain,
      publicUrl: this.ensureTrailingSlash(`https://${spDomain}`),
    };
  }

  private readPersistedManagedCloudRegistration(providerId: string): XpodManagedCloudRegistration | undefined {
    try {
      if (!fs.existsSync(this.cloudRegistrationPath)) {
        return undefined;
      }

      const raw = fs.readFileSync(this.cloudRegistrationPath, 'utf-8');
      const payload = JSON.parse(raw) as unknown;
      if (!payload || typeof payload !== 'object') {
        return undefined;
      }

      const record = (payload as Record<string, unknown>)[providerId];
      return parseManagedCloudRegistration(record);
    } catch (error) {
      safeConsoleError('[XpodManager] Failed to read managed Cloud registration:', error);
      return undefined;
    }
  }

  private persistManagedCloudRegistration(
    providerId: string,
    registration: XpodManagedCloudRegistration,
  ): void {
    try {
      const existing = readJsonObjectFile(this.cloudRegistrationPath);
      existing[providerId] = registration;
      fs.mkdirSync(path.dirname(this.cloudRegistrationPath), { recursive: true });
      fs.writeFileSync(
        this.cloudRegistrationPath,
        JSON.stringify(existing, null, 2),
        { encoding: 'utf-8', mode: 0o600 },
      );
      fs.chmodSync(this.cloudRegistrationPath, 0o600);
    } catch (error) {
      safeConsoleError('[XpodManager] Failed to persist managed Cloud registration:', error);
      throw error;
    }
  }

  private readState(): XpodServiceState | null {
    try {
      if (!fs.existsSync(this.statePath)) {
        return null;
      }

      const raw = fs.readFileSync(this.statePath, 'utf-8');
      return JSON.parse(raw) as XpodServiceState;
    } catch (error) {
      safeConsoleError('[XpodManager] Failed to read state:', error);
      return null;
    }
  }

  private writeState(state: XpodServiceState): void {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  private clearState(): void {
    if (fs.existsSync(this.statePath)) {
      fs.rmSync(this.statePath, { force: true });
    }
  }

  private isProcessAlive(pid: number): boolean {
    const child = this.childProcess;
    if (child?.pid === pid) {
      return !child.killed && child.exitCode === null && child.signalCode === null;
    }

    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (isErrnoException(error) && error.code === 'EPERM') {
        return true;
      }
      return false;
    }
  }

  private async killProcess(pid: number): Promise<void> {
    debugXpodManager('sending SIGTERM to xpod process tree', { pid });
    await new Promise<void>((resolve) => {
      kill(pid, 'SIGTERM', () => resolve());
    });
  }

  private async waitForReady(localUrl: string, pid?: number, maxRetries = 30): Promise<void> {
    for (let index = 0; index < maxRetries; index += 1) {
      if (pid && !this.isProcessAlive(pid)) {
        throw new Error('Local 服务在完成启动前已退出。');
      }

      const healthy = await this.isServiceReady(localUrl);
      if (healthy) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`等待 Local 服务就绪超时：${localUrl}`);
  }

  private async waitForShutdown(localUrl: string, maxRetries = 20): Promise<void> {
    for (let index = 0; index < maxRetries; index += 1) {
      const healthy = await this.isServiceReady(localUrl);
      if (!healthy) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private async isServiceReady(localUrl: string): Promise<boolean> {
    try {
      const url = new URL('/service/status', localUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      const response = await desktopFetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        return false;
      }

      const items = await response.json() as Array<{ name?: string; status?: string }>;
      const css = items.find((item) => item?.name === 'css');
      const api = items.find((item) => item?.name === 'api');
      return css?.status === 'running' && api?.status === 'running';
    } catch {
      return false;
    }
  }

  private async readProvisioningFromRunningService(input: {
    providerId: string;
    localUrl: string;
    provisioning?: XpodManagedCloudRegistration;
  }): Promise<XpodManagedCloudRegistration | undefined> {
    const current = this.readPersistedManagedCloudRegistration(input.providerId) ?? input.provisioning;
    if (!current) {
      return input.provisioning;
    }

    const status = await this.fetchProvisionStatus(input.localUrl);
    const refreshed = this.readPersistedManagedCloudRegistration(input.providerId) ?? current;
    return mergeProvisioningStatus(refreshed, status) ?? refreshed;
  }

  private async fetchProvisionStatus(localUrl: string): Promise<ProvisionStatusResponse | null> {
    try {
      const url = new URL('/provision/status', localUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await desktopFetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        return null;
      }
      const payload = await response.json() as unknown;
      return payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as ProvisionStatusResponse
        : null;
    } catch {
      return null;
    }
  }

  private normalizeStartError(error: unknown, port: number): Error {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics = [message, this.lastProcessErrorOutput].filter(Boolean).join('\n');
    const normalized = diagnostics.toLowerCase();

    if (normalized.includes('eaddrinuse') || normalized.includes('address already in use')) {
      return new Error(`本地端口 ${port} 已被占用，无法启动本地空间。`);
    }

    if (normalized.includes('local tcp listen is not permitted')) {
      return new Error('当前运行环境不允许本地监听端口，本地空间无法启动。');
    }

    if (normalized.includes('spawn bun enoent')) {
      return new Error('本机缺少本地空间运行环境。请检查网络后重试，LinX 会自动安装需要的组件。');
    }

    if (normalized.includes('unable to install @undefineds.co/xpod')) {
      return new Error('本地空间组件下载失败。请检查网络后重试。');
    }

    if (
      normalized.includes('cannot find module')
      || normalized.includes('invalid resource iri')
      || normalized.includes('jsonld')
      || normalized.includes('componentsjs')
      || normalized.includes('require stack')
      || normalized.includes('err_require_esm')
      || normalized.includes('node_modules')
      || normalized.includes('/users/')
      || normalized.includes('application support')
    ) {
      return new Error('本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。');
    }

    if (
      normalized.includes('unable to locate xpod')
      || normalized.includes('unable to prepare xpod runtime')
      || normalized.includes('unable to determine exact @undefineds.co/xpod version')
    ) {
      return new Error('本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。');
    }

    if (normalized.includes('local 服务在完成启动前已退出')) {
      return new Error('本地空间启动失败。请点“重新检查”；如果仍失败，请重启 LinX。');
    }

    if (normalized.includes('等待 local 服务就绪超时')) {
      return new Error('本地空间启动超时。请点“重新检查”；如果仍失败，请重启 LinX。');
    }

    if (this.lastProcessErrorOutput.trim().length > 0 || isInternalStartDiagnostic(message)) {
      return new Error('本地空间启动失败。请点“重新检查”；如果仍失败，请重启 LinX。');
    }

    return error instanceof Error ? error : new Error(message);
  }

  private readLogTail(filePath: string | null | undefined, maxBytes = 4000): string {
    if (!filePath || !fs.existsSync(filePath)) {
      return '';
    }

    try {
      const stats = fs.statSync(filePath);
      const start = Math.max(0, stats.size - maxBytes);
      const fd = fs.openSync(filePath, 'r');

      try {
        const buffer = Buffer.alloc(stats.size - start);
        fs.readSync(fd, buffer, 0, buffer.length, start);
        return buffer.toString('utf-8').trim();
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return '';
    }
  }

  private matchesDesiredState(
    current: Pick<XpodServiceState, 'providerId' | 'dataDir' | 'port' | 'spaceKind' | 'baseUrl'>,
    desired: Pick<XpodServiceState, 'providerId' | 'dataDir' | 'port' | 'spaceKind' | 'baseUrl'>
  ): boolean {
    return current.providerId === desired.providerId
      && current.dataDir === desired.dataDir
      && current.port === desired.port
      && current.spaceKind === desired.spaceKind
      && current.baseUrl === desired.baseUrl;
  }

  private canFastReuseRunningService(
    current: XpodServiceState,
    desired: XpodStartOptions,
    provisioning: XpodManagedCloudRegistration | undefined = current.provisioning,
  ): boolean {
    if (current.providerId !== desired.providerId) {
      return false;
    }

    if (current.dataDir !== path.resolve(desired.dataDir)) {
      return false;
    }

    if (current.port !== desired.port || current.spaceKind !== desired.spaceKind) {
      return false;
    }

    if (desired.spaceKind !== 'local') {
      return true;
    }

    const hasReusableProvisioning = Boolean(
      provisioning?.publicUrl
      && provisioning?.provisionCode
      && isProvisionCodeReusable(provisioning.provisionCode)
      && provisioning?.cloudIdentityUrl,
    );
    if (!hasReusableProvisioning) {
      return false;
    }
    const reusableProvisioning = provisioning as XpodManagedCloudRegistration;

    if (desired.domain?.type === 'custom' && desired.domain.value?.trim()) {
      return current.baseUrl === this.ensureTrailingSlash(`https://${desired.domain.value}`);
    }

    if (desired.domain?.type === 'managed' && desired.domain.value?.trim()) {
      return reusableProvisioning.spDomain === normalizeHostname(desired.domain.value)
        && reusableProvisioning.publicUrl === this.ensureTrailingSlash(`https://${desired.domain.value}`);
    }

    return true;
  }

  private matchesProvisioning(
    current: XpodManagedCloudRegistration | undefined,
    desired: XpodManagedCloudRegistration | undefined,
  ): boolean {
    if (!current && !desired) {
      return true;
    }

    if (!current) {
      return false;
    }

    if (!desired) {
      return false;
    }

    return current.nodeId === desired.nodeId
      && current.nodeToken === desired.nodeToken
      && current.serviceToken === desired.serviceToken
      && current.provisionCode === desired.provisionCode
      && current.provisionUrl === desired.provisionUrl
      && current.publicUrl === desired.publicUrl
      && current.spDomain === desired.spDomain
      && current.tunnelToken === desired.tunnelToken
      && current.tunnelProvider === desired.tunnelProvider
      && current.tunnelEndpoint === desired.tunnelEndpoint
      && current.cloudIdentityUrl === desired.cloudIdentityUrl
      && current.cloudApiUrl === desired.cloudApiUrl;
  }

  private matchesRuntimeEnvFile(expected: Record<string, string>): boolean {
    const current = readEnvObjectFile(this.runtimeEnvPath);
    if (!current) {
      return false;
    }

    for (const [key, value] of Object.entries(expected)) {
      if (typeof value !== 'string') {
        continue;
      }
      if (current[key] !== value) {
        debugXpodManager('xpod runtime env mismatch', {
          key,
          expected: maskEnvValueForLog(key, value),
          actual: maskEnvValueForLog(key, current[key]),
        });
        return false;
      }
    }

    return true;
  }

  private reportStartProgress(
    onProgress: XpodStartProgressHandler | undefined,
    progress: XpodStartProgress,
  ): void {
    debugXpodManager('start progress', { ...progress });
    onProgress?.(progress);
  }

  private async resolvePreferredLaunchTarget(onProgress?: XpodStartProgressHandler): Promise<XpodLaunchTarget> {
    return resolveManagedXpodLaunchTarget({
      appIsPackaged: app.isPackaged,
      desktopDir: this.desktopDir,
      cwd: process.cwd(),
      env: process.env,
      resourcesPath: process.resourcesPath,
      defaultXpodVersion: desktopBuildMeta.xpodVersion,
      xpodRuntimeDir: this.xpodRuntimeDir,
      onProgress,
    });
  }

  private buildRuntimeInfo(state: Pick<XpodServiceState, 'launchKind' | 'runtimeId'> | null | undefined): XpodRuntimeInfo {
    const targetVersion = desktopBuildMeta.xpodVersion?.trim() || null;
    const currentVersion = this.extractManagedRuntimeVersion(state);
    const upgradeAvailable = Boolean(
      targetVersion
      && currentVersion
      && currentVersion !== targetVersion
      && this.isManagedPackageRuntime(state?.launchKind),
    );

    return {
      launchKind: state?.launchKind ?? null,
      currentVersion,
      targetVersion,
      upgradeAvailable,
    };
  }

  private extractManagedRuntimeVersion(state: Pick<XpodServiceState, 'launchKind' | 'runtimeId'> | null | undefined): string | null {
    if (!this.isManagedPackageRuntime(state?.launchKind)) {
      return null;
    }

    const runtimeVersion = state?.runtimeId?.split('|')[3]?.trim();
    return runtimeVersion || null;
  }

  private isManagedPackageRuntime(launchKind: string | null | undefined): boolean {
    return launchKind === 'managed-bun-package' || launchKind === 'managed-node-package';
  }

  private buildRuntimeId(target: XpodLaunchTarget): string {
    return [
      target.kind,
      path.resolve(target.rootDir),
      path.resolve(target.entryPath),
      target.runtimeVersion ?? '',
      this.buildDevSourceRuntimeFingerprint(target),
    ].join('|');
  }

  private buildDevSourceRuntimeFingerprint(target: XpodLaunchTarget): string {
    if (target.kind !== 'dev-source') {
      return '';
    }

    const watchedPaths = [
      target.entryPath,
      path.join(target.rootDir, 'package.json'),
      path.join(target.rootDir, 'config', 'local.json'),
      path.join(target.rootDir, 'config', 'main.json'),
      path.join(target.rootDir, 'config', 'xpod.base.json'),
      path.join(target.rootDir, 'src', 'identity', 'ReactAppViewHandler.ts'),
      path.join(target.rootDir, 'static', 'app', 'auth.html'),
      path.join(target.rootDir, 'static', 'app', 'assets', 'main.js'),
      path.join(target.rootDir, 'static', 'app', 'assets', 'index.css'),
    ];

    const fingerprint = watchedPaths
      .map((filePath) => this.readRuntimeFileFingerprint(filePath))
      .filter((value): value is string => Boolean(value))
      .join(',');

    return fingerprint ? `dev-mtime:${fingerprint}` : 'dev-mtime:none';
  }

  private readRuntimeFileFingerprint(filePath: string): string | null {
    try {
      const stat = fs.statSync(filePath);
      return `${path.relative(process.cwd(), filePath)}=${stat.mtimeMs}:${stat.size}`;
    } catch {
      return null;
    }
  }

  private ensureTrailingSlash(url: string): string {
    return url.endsWith('/') ? url : `${url}/`;
  }
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeHostname(value: string): string | undefined {
  try {
    const parsed = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
    return parsed.hostname.trim().toLowerCase() || undefined;
  } catch {
    const hostname = value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//u, '')
      .replace(/\/.*$/u, '')
      .replace(/\.$/u, '');
    return hostname || undefined;
  }
}

function buildProvisionUrl(cloudIdentityUrl: string, provisionCode: string): string {
  const url = new URL('/.account/', `${normalizeUrl(cloudIdentityUrl)}/`);
  url.searchParams.set('provisionCode', provisionCode);
  return url.toString();
}

function extractProvisionCodeFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    return parsed.searchParams.get('provisionCode');
  } catch {
    return null;
  }
}

function replaceProvisionCodeInUrl(rawUrl: string, provisionCode: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.searchParams.has('provisionCode')) {
      return rawUrl;
    }
    parsed.searchParams.set('provisionCode', provisionCode);
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function derivePublicUrlFromSpDomain(spDomain?: string): string | undefined {
  const domain = spDomain?.trim();
  return domain ? `https://${domain}/` : undefined;
}

function normalizedExistingSpDomain(
  registration: Pick<XpodManagedCloudRegistration, 'spDomain'> | undefined,
): string | undefined {
  return registration?.spDomain ? normalizeHostname(registration.spDomain) : undefined;
}

function isExplicitlyClearedManagedDomain(options: XpodStartOptions): boolean {
  return options.domain?.type === 'managed' && !options.domain.value?.trim();
}

function canReuseManagedCloudRegistration(
  registration: XpodManagedCloudRegistration | undefined,
  options: {
    configuredPublicUrl?: string;
    configuredManagedPublicUrl?: string;
    configuredManagedSpDomain?: string;
    explicitlyClearedManagedDomain: boolean;
    expectedPublicUrl?: string;
  },
): boolean {
  if (!registration?.publicUrl || options.explicitlyClearedManagedDomain) {
    return false;
  }

  if (options.configuredPublicUrl) {
    return registration.publicUrl === options.configuredPublicUrl;
  }

  const registrationSpDomain = normalizedExistingSpDomain(registration);
  if (options.configuredManagedSpDomain) {
    if (
      registrationSpDomain === options.configuredManagedSpDomain
      || registration.publicUrl === options.configuredManagedPublicUrl
    ) {
      return true;
    }

    // `node-0000.undefineds.co` was used as a managed-domain placeholder in
    // older provider config. If Cloud already returned a concrete managed
    // node domain, keep that authoritative registration instead of reallocating.
    return options.configuredManagedSpDomain === OFFICIAL_PREALLOCATED_MANAGED_SP_DOMAIN
      && isCurrentManagedSpDomain(registrationSpDomain);
  }

  return Boolean(options.expectedPublicUrl && registration.publicUrl === options.expectedPublicUrl);
}

function isCurrentManagedSpDomain(spDomain: string | undefined): boolean {
  return Boolean(spDomain && /^node-[a-z0-9-]+\.undefineds\.co$/iu.test(spDomain));
}

function isManagedProvisionFallbackError(error: unknown): boolean {
  const message = readErrorDiagnostic(error);
  const normalized = message.toLowerCase();
  return normalized.includes('publicurl is required')
    || normalized.includes('failed to register sp node')
    || normalized.includes('fetch failed')
    || normalized.includes('connect timeout')
    || normalized.includes('timeout');
}

function createManagedCloudRegistrationError(error: unknown): Error {
  const rawMessage = readErrorDiagnostic(error);
  const userMessage = formatManagedCloudRegistrationError(rawMessage);
  const next = new Error(userMessage);
  (next as Error & { rawMessage?: string }).rawMessage = rawMessage;
  return next;
}

function formatManagedCloudRegistrationError(rawMessage: string): string {
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes('publicurl is required')) {
    return '本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。';
  }

  if (normalized.includes('invalid or expired provisioncode') || normalized.includes('provisioncode expired')) {
    return '这次本地登录已失效。请回到空间选择页，重新点“本地空间”。';
  }

  if (normalized.includes('http 401') || normalized.includes('unauthorized')) {
    return '登录状态已失效。请重新登录。';
  }

  if (normalized.includes('http 403') || normalized.includes('forbidden')) {
    return '这个账号还不能写入当前空间。请换一个空间；如果这是你的本地空间，请先完成空间创建。';
  }

  if (normalized.includes('failed to fetch') || normalized.includes('network') || normalized.includes('timeout')) {
    return '无法连接登录服务。请检查网络后重试。';
  }

  return '本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。';
}

function readErrorDiagnostic(error: unknown): string {
  if (error instanceof Error) {
    const rawMessage = (error as Error & { rawMessage?: unknown }).rawMessage;
    if (typeof rawMessage === 'string' && rawMessage.trim()) {
      return rawMessage;
    }
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause) {
      const causeMessage = readErrorDiagnostic(cause);
      if (causeMessage.trim()) {
        return `${error.message}\n${causeMessage}`;
      }
    }
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return String(error);
}

function isInternalStartDiagnostic(message: string): boolean {
  return /@undefineds\.co|xpod runtime|node_modules|\/Users\/|\\Users\\|Application Support|Require stack|Cannot find module|jsonld|componentsjs|publicUrl|provisionCode|spDomain|baseUrl|canonical|OIDC|issuer|provider|HTTP\s+\d{3}|Pod|Solid|Agent|Secretary|WebID|IRI|RDF|row\.id|https?:\/\/|file:\/\/|localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(message);
}

function isOfficialCloudApiOrigin(value: string): boolean {
  return normalizeUrl(value) === OFFICIAL_CLOUD_API_ORIGIN;
}

function toProvisioningInfo(
  provisioning: XpodManagedCloudRegistration | undefined,
): XpodProvisioningInfo | undefined {
  if (!provisioning) {
    return undefined;
  }

  return {
    nodeId: provisioning.nodeId,
    publicUrl: provisioning.publicUrl,
    provisionCode: provisioning.provisionCode,
    provisionUrl: provisioning.provisionUrl,
    spDomain: provisioning.spDomain,
    tunnelToken: provisioning.tunnelToken,
    tunnelProvider: provisioning.tunnelProvider,
    tunnelEndpoint: provisioning.tunnelEndpoint,
    cloudIdentityUrl: provisioning.cloudIdentityUrl,
    cloudApiUrl: provisioning.cloudApiUrl,
    registeredAt: provisioning.registeredAt,
  };
}

function mergeProvisioningStatus(
  current: XpodManagedCloudRegistration,
  status: ProvisionStatusResponse | null,
): XpodManagedCloudRegistration | null {
  if (!status?.registered || typeof status.provisionCode !== 'string' || !status.provisionCode.trim()) {
    return null;
  }

  if (typeof status.nodeId === 'string' && status.nodeId.trim() && status.nodeId !== current.nodeId) {
    return null;
  }

  const publicUrl = normalizeUrlWithTrailingSlash(status.publicUrl) ?? current.publicUrl;
  const cloudIdentityUrl = resolveCloudIdentityUrlFromProvisionUrl(status.provisionUrl) ?? current.cloudIdentityUrl;
  const cloudApiUrl = typeof status.cloudUrl === 'string' && status.cloudUrl.trim()
    ? normalizeUrl(status.cloudUrl)
    : current.cloudApiUrl;
  const provisionUrl = typeof status.provisionUrl === 'string' && status.provisionUrl.trim()
    ? status.provisionUrl
    : buildProvisionUrl(cloudIdentityUrl, status.provisionCode);

  return {
    ...current,
    nodeId: status.nodeId ?? current.nodeId,
    provisionCode: status.provisionCode,
    publicUrl,
    spDomain: typeof status.spDomain === 'string' && status.spDomain.trim() ? status.spDomain : current.spDomain,
    provisionUrl,
    cloudIdentityUrl,
    cloudApiUrl,
  };
}

function resolveCloudIdentityUrlFromProvisionUrl(provisionUrl: string | undefined): string | null {
  if (!provisionUrl?.trim()) {
    return null;
  }

  try {
    return normalizeUrl(new URL(provisionUrl).origin);
  } catch {
    return null;
  }
}

function toStartOptions(
  provider: ReturnType<ProviderManager['getManagedPods']>[number],
  spaceKindOverride?: XpodStartOptions['spaceKind'],
): XpodStartOptions {
  if (!provider.managed) {
    throw new Error(`Provider '${provider.id}' is not managed`);
  }

  const spaceKind = spaceKindOverride ?? provider.managed.spaceKind;
  if (!spaceKind) {
    throw new Error(`Provider '${provider.id}' has no selected Local space`);
  }

  return {
    providerId: provider.id,
    dataDir: provider.managed.dataDir,
    port: provider.managed.port,
    spaceKind,
    domain: provider.managed.domain,
    tunnelToken: provider.managed.tunnelToken,
  };
}

function toSqliteUrl(filePath: string): string {
  return `sqlite:${path.resolve(filePath)}`;
}

function readJsonObjectFile(filePath: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readEnvObjectFile(filePath: string): Record<string, string> | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const env: Record<string, string> = {};
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/u);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      env[trimmed.slice(0, separatorIndex)] = trimmed.slice(separatorIndex + 1);
    }

    return env;
  } catch {
    return null;
  }
}

function maskEnvValueForLog(key: string, value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (/TOKEN|SECRET|CODE/iu.test(key)) {
    return value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : '***';
  }
  return value;
}

function parseManagedCloudRegistration(value: unknown): XpodManagedCloudRegistration | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const nodeId = readString(record.nodeId);
  const nodeToken = readString(record.nodeToken);
  const serviceToken = readString(record.serviceToken);
  const provisionCode = readString(record.provisionCode);
  const publicUrl = readString(record.publicUrl);
  const provisionUrl = readString(record.provisionUrl);
  const cloudIdentityUrl = readString(record.cloudIdentityUrl);
  const cloudApiUrl = readString(record.cloudApiUrl);

  if (
    !nodeId
    || !nodeToken
    || !serviceToken
    || !provisionCode
    || !publicUrl
    || !provisionUrl
    || !cloudIdentityUrl
    || !cloudApiUrl
  ) {
    return undefined;
  }

  const registeredAt = typeof record.registeredAt === 'number' && Number.isFinite(record.registeredAt)
    ? record.registeredAt
    : Date.now();

  const canonicalPublicUrl = resolveRegistrationCanonicalPublicUrl({
    provisionCode,
    publicUrl,
    spDomain: readString(record.spDomain),
  }) ?? ensureTrailingSlashValue(publicUrl);

  return {
    nodeId,
    nodeToken,
    serviceToken,
    provisionCode,
    publicUrl: canonicalPublicUrl,
    provisionUrl,
    spDomain: readString(record.spDomain),
    tunnelToken: readString(record.tunnelToken),
    tunnelProvider: readString(record.tunnelProvider),
    tunnelEndpoint: readString(record.tunnelEndpoint),
    cloudIdentityUrl: normalizeUrl(cloudIdentityUrl),
    cloudApiUrl: normalizeUrl(cloudApiUrl),
    registeredAt,
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function ensureTrailingSlashValue(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}
