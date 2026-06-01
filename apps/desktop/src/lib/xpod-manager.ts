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
  resolveXpodLaunchTarget,
  type XpodLaunchProgress,
  type XpodLaunchTarget,
} from './xpod-launch';
import { ensureLinxLocalHome } from './local-home';
import buildMeta from '../generated/build-meta.json';

const OFFICIAL_CLOUD_IDENTITY_ORIGIN = 'https://id.undefineds.co';
const OFFICIAL_CLOUD_API_ORIGIN = 'https://api.undefineds.co';
const OFFICIAL_PREALLOCATED_MANAGED_SP_DOMAIN = 'node-0000.undefineds.co';
const MANAGED_CLOUD_REGISTRATION_TIMEOUT_MS = 30000;
const CANONICAL_OIDC_ISSUER_ENV_KEY = 'oidcIssuer';
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
    console.log(`[XpodManager:debug] ${message}`, payload);
  } else {
    console.log(`[XpodManager:debug] ${message}`);
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

function isProvisionCodeScopedToCanonicalUrl(code: string, canonicalUrl: string | undefined): boolean {
  const payload = decodeProvisionCodePayload(code);
  if (!payload) {
    return true;
  }

  const expectedCanonicalUrl = normalizeUrlWithTrailingSlash(canonicalUrl);
  if (!expectedCanonicalUrl) {
    return true;
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
    this.reportStartProgress(onProgress, {
      phase: 'resolve-runtime',
      label: '检查 xpod 运行环境',
      detail: 'Bun 优先，Node/npm 作为 fallback',
    });
    const preferredTarget = await this.resolvePreferredLaunchTarget(onProgress);
    this.reportStartProgress(onProgress, {
      phase: 'resolve-runtime',
      label: 'xpod 启动方式已确定',
      detail: preferredTarget.kind,
    });
    if (this.requiresManagedCloudRegistration(options)) {
      this.reportStartProgress(onProgress, {
        phase: 'register-cloud',
        label: '绑定 Cloud 身份',
        detail: '准备 Local 公网接入凭证',
      });
    }
    const existingRegistration = existing?.providerId === options.providerId
      ? existing.provisioning ?? this.readPersistedManagedCloudRegistration(options.providerId)
      : this.readPersistedManagedCloudRegistration(options.providerId);
    const provisioning = this.requiresManagedCloudRegistration(options)
      ? await this.ensureManagedCloudRegistration(options, existingRegistration)
      : undefined;
    if (provisioning) {
      this.persistManagedCloudRegistration(options.providerId, provisioning);
      this.reportStartProgress(onProgress, {
        phase: 'register-cloud',
        label: 'Cloud 绑定已完成',
        detail: provisioning.publicUrl,
      });
    }
    const desiredState = this.createDesiredState(options, provisioning?.publicUrl);

    if (existing) {
      const existingHealthy = await this.isServiceReady(existing.localUrl);
      if (
        existingHealthy
        && this.matchesDesiredState(existing, desiredState)
        && this.matchesProvisioning(existing.provisioning, provisioning)
        && !this.shouldReplaceManagedRuntime(existing, preferredTarget)
      ) {
        this.reportStartProgress(onProgress, {
          phase: 'ready',
          label: 'Local 已运行',
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
      label: '准备 Local 数据目录',
      detail: desiredState.dataDir,
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
      const runtimeEnv = this.buildServiceEnv(options, desiredState, provisioning);
      this.reportStartProgress(onProgress, {
        phase: 'write-env',
        label: '写入 xpod 启动配置',
        detail: desiredState.baseUrl,
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
          label: '启动 xpod 进程',
          detail: launchSpec.command,
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
        label: '等待 Local 服务就绪',
        detail: desiredState.localUrl,
      });
      await this.waitForReady(
        desiredState.localUrl,
        child.pid,
        target.kind === 'dev-source' ? 90 : 30,
      );
      this.reportStartProgress(onProgress, {
        phase: 'ready',
        label: 'Local 已就绪',
        detail: desiredState.localUrl,
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

  async getStatus(): Promise<XpodStatus> {
    const state = this.readState();
    if (!state) {
      const external = await this.detectExternalService();
      if (external) {
        return external;
      }

      return { running: false, status: 'stopped' };
    }

    const isCurrentChildProcess = Boolean(
      this.childProcess?.pid
      && state.pid
      && this.childProcess.pid === state.pid,
    );

    if (!app.isPackaged && !isCurrentChildProcess) {
      const preferredTarget = this.resolveComparableLaunchTarget();
      if (this.shouldReplaceManagedRuntime(state, preferredTarget)) {
        await this.disposeManagedRuntime(state);
        return {
          running: false,
          status: 'stopped',
          providerId: state.providerId,
          port: state.port,
          baseUrl: state.baseUrl,
          localUrl: state.localUrl,
          pid: state.pid,
          provisioning: toProvisioningInfo(state.provisioning),
        };
      }
    }

    const healthy = await this.isServiceReady(state.localUrl);
    if (healthy) {
      this.currentProviderId = state.providerId;
      this.providerManager.updateManagedStatus(state.providerId, 'running');
      return {
        running: true,
        status: 'running',
        providerId: state.providerId,
        port: state.port,
        baseUrl: state.baseUrl,
        localUrl: state.localUrl,
        pid: state.pid,
        provisioning: toProvisioningInfo(state.provisioning),
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

      return {
        running: true,
        status: 'running',
        providerId: candidate.providerId,
        port: candidate.port,
        baseUrl: candidate.baseUrl,
        localUrl: candidate.localUrl,
        provisioning: candidate.provisioning,
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
      console.error('[XpodManager] Failed to spawn xpod:', error);
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
      console.log(`[XpodManager] xpod exited with code ${code} signal ${signal}`);
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
    } else {
      delete env.XPOD_NODE_ID;
      delete env.XPOD_NODE_TOKEN;
      delete env.XPOD_SERVICE_TOKEN;
      delete env.XPOD_PROVISION_CODE;
      delete env.XPOD_PROVISION_URL;
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
    const expectedPublicUrl = configuredPublicUrl ?? existingCanonicalPublicUrl ?? undefined;
    const canReuseExistingRegistration = Boolean(
      normalizedExisting
      && (
        configuredPublicUrl
          ? normalizedExisting.publicUrl === configuredPublicUrl
          : normalizedExisting.publicUrl && normalizedExisting.publicUrl === expectedPublicUrl
      ),
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
      && isProvisionCodeScopedToCanonicalUrl(normalizedExisting.provisionCode, expectedPublicUrl)
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
      spDomain: normalizedExisting?.spDomain ?? configuredManagedSpDomain,
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
      if (!fallbackRequest || !isMissingPublicUrlProvisionError(error)) {
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
      throw new Error('Cloud 返回的 Local canonical URL 不完整。');
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
      const response = await fetch(endpoint, {
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
        throw new Error('连接 Cloud 注册 Local 节点超时。');
      }
      throw new Error(`无法完成 Local 的 Cloud 绑定：${error instanceof Error ? error.message : String(error)}`);
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
      console.error('[XpodManager] Failed to read managed Cloud registration:', error);
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
      console.error('[XpodManager] Failed to persist managed Cloud registration:', error);
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
      console.error('[XpodManager] Failed to read state:', error);
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

      const response = await fetch(url, { signal: controller.signal });
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

  private normalizeStartError(error: unknown, port: number): Error {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('EADDRINUSE')) {
      return new Error(`本地端口 ${port} 已被占用，无法启动 Local。`);
    }

    if (message.includes('local TCP listen is not permitted')) {
      return new Error('当前运行环境不允许本地监听端口，Local 无法启动。');
    }

    if (message.includes('spawn bun ENOENT')) {
      return new Error('未找到 bun，无法启动 Local。请安装 bun，或确保本机可用 Node/npm 作为 fallback。');
    }

    if (message.includes('Unable to install @undefineds.co/xpod')) {
      return new Error(`无法准备本地 xpod runtime。请检查网络或 npm registry 配置。\n${message}`);
    }

    if (this.lastProcessErrorOutput.includes('ERR_REQUIRE_ESM')) {
      return new Error('当前安装的 @undefineds.co/xpod JS 包与 @undefineds.co/models 的模块格式不兼容。请优先使用本地 xpod 源码（bun）启动。');
    }

    if (this.lastProcessErrorOutput.trim().length > 0) {
      return new Error(`${message}\n${this.lastProcessErrorOutput.trim()}`);
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
      && current.publicUrl === desired.publicUrl
      && current.spDomain === desired.spDomain
      && current.tunnelToken === desired.tunnelToken
      && current.tunnelProvider === desired.tunnelProvider
      && current.tunnelEndpoint === desired.tunnelEndpoint
      && current.cloudIdentityUrl === desired.cloudIdentityUrl
      && current.cloudApiUrl === desired.cloudApiUrl;
  }

  private reportStartProgress(
    onProgress: XpodStartProgressHandler | undefined,
    progress: XpodStartProgress,
  ): void {
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

  private resolveComparableLaunchTarget(): XpodLaunchTarget {
    return resolveXpodLaunchTarget({
      appIsPackaged: app.isPackaged,
      desktopDir: this.desktopDir,
      cwd: process.cwd(),
      env: process.env,
      resourcesPath: process.resourcesPath,
    });
  }

  private shouldReplaceManagedRuntime(
    state: Pick<XpodServiceState, 'launchKind' | 'runtimeId'>,
    preferredTarget: XpodLaunchTarget,
  ): boolean {
    if (app.isPackaged) {
      return false;
    }

    if (!state.launchKind) {
      return false;
    }

    if (state.launchKind !== preferredTarget.kind) {
      return true;
    }

    const preferredRuntimeId = this.buildRuntimeId(preferredTarget);
    return state.runtimeId !== preferredRuntimeId;
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

  private async disposeManagedRuntime(state: Pick<XpodServiceState, 'providerId' | 'pid' | 'localUrl'>): Promise<void> {
    if (state.pid && this.isProcessAlive(state.pid)) {
      this.stoppingPid = state.pid;
      this.childProcess = null;
      this.lastProcessErrorOutput = '';
      await this.killProcess(state.pid);
      await this.waitForShutdown(state.localUrl);
    }

    this.clearState();
    this.currentProviderId = null;
    this.stoppingPid = null;

    try {
      this.providerManager.updateManagedStatus(state.providerId, 'stopped');
    } catch {
      // provider may have been removed
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

function derivePublicUrlFromSpDomain(spDomain?: string): string | undefined {
  const domain = spDomain?.trim();
  return domain ? `https://${domain}/` : undefined;
}

function isMissingPublicUrlProvisionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('publicUrl is required');
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
