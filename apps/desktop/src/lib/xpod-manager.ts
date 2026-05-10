import * as fs from 'fs';
import * as path from 'path';
import { spawn, type ChildProcess } from 'node:child_process';
import kill from 'tree-kill';
import { app } from 'electron';
import { Supervisor } from '../../../../lib/supervisor';
import { ConfigManager } from './config-manager';
import { ProviderManager } from './provider-manager';
import { resolveXpodLaunchTarget, type XpodLaunchTarget } from './xpod-launch';
import { ensureLinxLocalHome } from './local-home';

const OFFICIAL_CLOUD_IDENTITY_ORIGIN = 'https://id.undefineds.co';
const OFFICIAL_CLOUD_API_ORIGIN = 'https://api.undefineds.co';
const MANAGED_CLOUD_REGISTRATION_TIMEOUT_MS = 30000;

export interface XpodStartOptions {
  providerId: string;
  dataDir: string;
  port: number;
  startupMode?: 'device-only' | 'remote-ready';
  domain?: {
    type: 'none' | 'custom';
    value?: string;
  };
  tunnelToken?: string;
}

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
  publicUrl: string;
  nodeId?: string;
  nodeToken?: string;
  serviceToken?: string;
  localPort?: number;
  tunnelToken?: string;
  tunnelMode?: 'client';
  domainMode?: 'self-managed';
  spDomain?: string;
}

interface ProvisionNodeResponse {
  nodeId?: string;
  nodeToken?: string;
  serviceToken?: string;
  provisionCode?: string;
  spDomain?: string;
  tunnelToken?: string;
  tunnelProvider?: string;
  tunnelEndpoint?: string;
}

export class XpodManager {
  private readonly configManager: ConfigManager;
  private readonly providerManager: ProviderManager;
  private readonly statePath: string;
  private readonly runtimeEnvPath: string;
  private readonly logsDir: string;
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
    this.runtimeEnvPath = localPaths.runtimeEnvFile;
    this.logsDir = localPaths.logsDir;
    this.desktopDir = path.resolve(__dirname, '../../../..');
  }

  async start(options: XpodStartOptions): Promise<void> {
    const existing = this.readState();
    const preferredTarget = this.resolvePreferredLaunchTarget();
    const provisioning = this.requiresManagedCloudRegistration(options)
      ? await this.ensureManagedCloudRegistration(options, existing?.provisioning)
      : undefined;
    const desiredState = this.createDesiredState(options, provisioning?.publicUrl);

    if (existing) {
      const existingHealthy = await this.isServiceReady(existing.localUrl);
      if (
        existingHealthy
        && this.matchesDesiredState(existing, desiredState)
        && this.matchesProvisioning(existing.provisioning, provisioning)
        && !this.shouldReplaceManagedRuntime(existing, preferredTarget)
      ) {
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
      const runtimeEnvPath = this.writeRuntimeEnvFile(runtimeEnv);
      runtimeEnv.XPOD_ENV_PATH = runtimeEnvPath;
      const launchSpec = this.buildLaunchSpec(target, desiredState.port, runtimeEnvPath);
      const spawnOptions = this.buildSpawnOptions(
        launchSpec.cwd,
        this.buildProcessEnv(target, runtimeEnv),
        stdoutPath,
        stderrPath,
      );
      let child: ChildProcess;

      try {
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
      child.unref();
      this.attachProcessHandlers(child, options.providerId);

      this.writeState({
        ...desiredState,
        provisioning,
        startedAt: Date.now(),
        pid: child.pid,
        launchKind: target.kind,
        logPath: stdoutPath,
        errorLogPath: stderrPath,
      });
      await this.waitForReady(
        desiredState.localUrl,
        child.pid,
        target.kind === 'dev-source' ? 90 : 30,
      );
      this.providerManager.updateManagedStatus(options.providerId, 'running');
    } catch (error) {
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
      await this.start({
        providerId: provider.id,
        dataDir: provider.managed.dataDir,
        port: provider.managed.port,
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

    const preferredTarget = this.resolvePreferredLaunchTarget();
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
    const candidates: Array<Required<Pick<XpodStatus, 'port' | 'baseUrl' | 'localUrl'>> & Pick<XpodStatus, 'providerId'>> = [];
    const seen = new Set<string>();

    const addCandidate = (candidate: {
      providerId?: string;
      port?: number;
      baseUrl?: string;
      localUrl?: string;
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
      });
    };

    for (const provider of this.providerManager.getManagedPods()) {
      if (!provider.managed) {
        continue;
      }

      const desiredState = this.createDesiredState(toStartOptions(provider));
      addCandidate({
        providerId: provider.id,
        port: desiredState.port,
        baseUrl: desiredState.baseUrl,
        localUrl: desiredState.localUrl,
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
        provisioning: undefined,
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
    if (fromState?.managed) {
      return toStartOptions(fromState);
    }

    const defaultProvider = this.providerManager.getDefault();
    if (defaultProvider?.managed) {
      return toStartOptions(defaultProvider);
    }

    const firstManagedProvider = this.providerManager.getManagedPods()[0];
    if (firstManagedProvider?.managed) {
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
      baseUrl,
      localUrl: this.ensureTrailingSlash(`http://localhost:${options.port}`),
      provisioning: undefined,
    };
  }

  private resolvePublicBaseUrl(options: XpodStartOptions): string {
    if (options.domain?.value) {
      return this.ensureTrailingSlash(`https://${options.domain.value}`);
    }

    return this.ensureTrailingSlash(`http://localhost:${options.port}`);
  }

  private buildLaunchSpec(
    target: XpodLaunchTarget,
    port: number,
    envPath: string,
  ): { command: string; args: string[]; cwd: string } {
    const configPath = path.join(target.rootDir, 'config', 'local.json');
    const sharedArgs = [
      '--config',
      configPath,
      '--env',
      envPath,
      '--port',
      String(port),
      '--host',
      '127.0.0.1',
    ];

    switch (target.kind) {
      case 'dev-source':
        return {
          command: process.env.LINX_XPOD_BUN_BINARY ?? 'bun',
          args: ['--no-env-file', target.entryPath, ...sharedArgs],
          cwd: target.rootDir,
        };
      case 'dev-dist':
        return {
          command: process.env.XPOD_NODE_BINARY ?? 'node',
          args: [target.entryPath, ...sharedArgs],
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
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...runtimeEnv,
    };

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

    delete env.CSS_IDP_URL;
    delete env.XPOD_OIDC_ISSUER;
    delete env.idpUrl;

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
      XPOD_MODE: envConfig.XPOD_MODE ?? 'local',
      XPOD_PORT: String(state.port),
      PORT: String(state.port),
      CSS_EDITION: envConfig.CSS_EDITION ?? 'local',
      edition: envConfig.CSS_EDITION ?? envConfig.XPOD_MODE ?? 'local',
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
        env.CSS_OIDC_ISSUER
        || OFFICIAL_CLOUD_IDENTITY_ORIGIN,
      );
      const managedCloudApiOrigin = normalizeUrl(
        env.XPOD_CLOUD_API_ENDPOINT
        || OFFICIAL_CLOUD_API_ORIGIN,
      );

      env.oidcIssuer = managedCloudIdentityOrigin;
      env.XPOD_CLOUD_API_ENDPOINT = managedCloudApiOrigin;
      delete env.CSS_IDP_URL;
      delete env.CSS_OIDC_ISSUER;
      delete env.XPOD_OIDC_ISSUER;
    } else {
      delete env.CSS_IDP_URL;
      delete env.CSS_OIDC_ISSUER;
      delete env.XPOD_OIDC_ISSUER;
      delete env.oidcIssuer;
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

    const effectiveTunnelToken = options.tunnelToken || provisioning?.tunnelToken;
    if (effectiveTunnelToken) {
      env.CLOUDFLARE_TUNNEL_TOKEN = effectiveTunnelToken;
    } else {
      delete env.CLOUDFLARE_TUNNEL_TOKEN;
      delete env.LINX_TUNNEL_PROVIDER;
    }

    return env;
  }

  private requiresManagedCloudRegistration(options: XpodStartOptions): boolean {
    return options.startupMode === 'remote-ready'
      || (options.domain?.type ?? 'none') !== 'none';
  }

  private async ensureManagedCloudRegistration(
    options: XpodStartOptions,
    existing: XpodManagedCloudRegistration | undefined,
  ): Promise<XpodManagedCloudRegistration> {
    const env = this.configManager.getAll();
    const cloudIdentityUrl = normalizeUrl(
      env.CSS_OIDC_ISSUER
      || OFFICIAL_CLOUD_IDENTITY_ORIGIN,
    );
    const managedCloudApiOrigin = normalizeUrl(
      env.XPOD_CLOUD_API_ENDPOINT
      || OFFICIAL_CLOUD_API_ORIGIN,
    );
    const expectedPublicUrl = this.resolveExpectedProvisionPublicUrl(options);

    if (
      existing
      && existing.cloudApiUrl === managedCloudApiOrigin
      && existing.cloudIdentityUrl === cloudIdentityUrl
      && existing.publicUrl === expectedPublicUrl
      && existing.nodeId
      && existing.nodeToken
      && existing.serviceToken
      && existing.provisionCode
    ) {
      return existing;
    }

    const provisionRequest = this.buildProvisionNodeRequest(options, {
      publicUrl: expectedPublicUrl,
      nodeId: existing?.nodeId,
      nodeToken: existing?.nodeToken,
      serviceToken: existing?.serviceToken,
      tunnelToken: options.tunnelToken || existing?.tunnelToken,
    });
    const registration = await this.registerProvisionedNode(managedCloudApiOrigin, {
      ...provisionRequest,
      localPort: options.port,
    });

    return {
      nodeId: registration.nodeId,
      nodeToken: registration.nodeToken,
      serviceToken: registration.serviceToken,
      provisionCode: registration.provisionCode,
      publicUrl: expectedPublicUrl,
      tunnelToken: registration.tunnelToken,
      tunnelProvider: registration.tunnelProvider,
      tunnelEndpoint: registration.tunnelEndpoint,
      provisionUrl: buildProvisionUrl(cloudIdentityUrl, registration.provisionCode),
      cloudIdentityUrl,
      cloudApiUrl: managedCloudApiOrigin,
      registeredAt: Date.now(),
    };
  }

  private resolveExpectedProvisionPublicUrl(options: XpodStartOptions): string {
    if (options.domain?.value) {
      return this.ensureTrailingSlash(`https://${options.domain.value}`);
    }

    throw new Error('Local 远程访问需要先配置用户自己的公网域名或隧道域名。');
  }

  private async registerProvisionedNode(
    cloudApiUrl: string,
    request: ProvisionNodeRequest,
  ): Promise<
    Required<Pick<XpodManagedCloudRegistration, 'nodeId' | 'nodeToken' | 'serviceToken' | 'provisionCode'>>
    & Pick<XpodManagedCloudRegistration, 'spDomain' | 'tunnelToken' | 'tunnelProvider' | 'tunnelEndpoint'>
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
    return {
      ...fields,
      domainMode: 'self-managed',
      spDomain: undefined,
      tunnelMode: fields.tunnelToken ? 'client' : undefined,
    };
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
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async killProcess(pid: number): Promise<void> {
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
      return new Error('未找到 bun，可执行本地 xpod 源码。请先安装 bun，或改用带单文件/平台二进制的 xpod 发行包。');
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
    current: Pick<XpodServiceState, 'providerId' | 'dataDir' | 'port' | 'baseUrl'>,
    desired: Pick<XpodServiceState, 'providerId' | 'dataDir' | 'port' | 'baseUrl'>
  ): boolean {
    return current.providerId === desired.providerId
      && current.dataDir === desired.dataDir
      && current.port === desired.port
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
      && current.cloudIdentityUrl === desired.cloudIdentityUrl
      && current.cloudApiUrl === desired.cloudApiUrl;
  }

  private resolvePreferredLaunchTarget(): XpodLaunchTarget {
    return resolveXpodLaunchTarget({
      appIsPackaged: app.isPackaged,
      desktopDir: this.desktopDir,
      cwd: process.cwd(),
      env: process.env,
      resourcesPath: process.resourcesPath,
    });
  }

  private shouldReplaceManagedRuntime(
    state: Pick<XpodServiceState, 'launchKind'>,
    preferredTarget: Pick<XpodLaunchTarget, 'kind'>,
  ): boolean {
    if (app.isPackaged) {
      return false;
    }

    if (!state.launchKind) {
      return false;
    }

    return state.launchKind !== preferredTarget.kind;
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

function buildProvisionUrl(cloudIdentityUrl: string, provisionCode: string): string {
  const url = new URL('/.account/', `${normalizeUrl(cloudIdentityUrl)}/`);
  url.searchParams.set('provisionCode', provisionCode);
  return url.toString();
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

function toStartOptions(provider: ReturnType<ProviderManager['getManagedPods']>[number]): XpodStartOptions {
  if (!provider.managed) {
    throw new Error(`Provider '${provider.id}' is not managed`);
  }

  return {
    providerId: provider.id,
    dataDir: provider.managed.dataDir,
    port: provider.managed.port,
    domain: provider.managed.domain,
    tunnelToken: provider.managed.tunnelToken,
  };
}

function toSqliteUrl(filePath: string): string {
  return `sqlite:${path.resolve(filePath)}`;
}
