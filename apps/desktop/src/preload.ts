import { contextBridge, ipcRenderer } from 'electron';

// Provider 类型
export interface ManagedPodConfig {
  status: 'stopped' | 'starting' | 'running' | 'error';
  dataDir: string;
  port: number;
  domain: {
    type: 'none' | 'custom';
    value?: string;
  };
  tunnelToken?: string;
}

export interface SolidProvider {
  id: string;
  name: string;
  issuerUrl: string;
  isDefault?: boolean;
  managed?: ManagedPodConfig;
}

export interface XpodStartOptions {
  providerId: string;
  dataDir: string;
  port: number;
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
  cloudIdentityUrl: string;
  cloudApiUrl: string;
  registeredAt: number;
}

export interface AppUpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  checkedAt: string | null;
  available: boolean;
  source: 'github-release' | 'custom-feed';
  error: string | null;
}

export type LocalOnboardingMode = 'device-only' | 'remote-ready';

export type LocalOnboardingState =
  | 'mode_required'
  | 'idle'
  | 'checking'
  | 'starting'
  | 'repair_required'
  | 'ready'
  | 'error';

export interface LocalOnboardingCapabilities {
  supported: boolean;
  contract: string | null;
  baseUrl: string | null;
  version: string | null;
}

export interface LocalOnboardingProgress {
  phase: string;
  label: string;
  detail?: string | null;
}

export interface LocalOnboardingSnapshot {
  state: LocalOnboardingState;
  mode: LocalOnboardingMode | null;
  localUrl: string | null;
  baseUrl: string | null;
  publicUrl: string | null;
  capabilities: LocalOnboardingCapabilities | null;
  cloudIdentityUrl: string | null;
  provisionCode: string | null;
  provisionUrl: string | null;
  nodeId: string | null;
  message: string | null;
  progress?: LocalOnboardingProgress | null;
  errorCode: string | null;
  canRetry: boolean;
  canOpenSettings: boolean;
}

export interface AuthAPI {
  prepareLoopbackRedirect: () => Promise<string>;
  getEmbeddedAuthorizationState: () => Promise<{ open: boolean; reason: 'opened' | 'completed' | 'dismissed'; ready: boolean }>;
  openAuthorizationWindow: (url: string, options?: { providerLabel?: string }) => Promise<void>;
  openEmbeddedAuthorization: (url: string, options?: { providerLabel?: string }) => Promise<void>;
  closeEmbeddedAuthorization: () => Promise<void>;
  consumePendingRedirect: () => Promise<string | null>;
  onAuthorizationWindowState: (
    callback: (state: { open: boolean; reason: 'opened' | 'completed' | 'dismissed' }) => void,
  ) => () => void;
  onEmbeddedAuthorizationState: (
    callback: (state: { open: boolean; reason: 'opened' | 'completed' | 'dismissed'; ready: boolean }) => void,
  ) => () => void;
  onRedirect: (callback: () => void) => () => void;
}

export interface LocalOnboardingAPI {
  getSnapshot: () => Promise<LocalOnboardingSnapshot>;
  chooseMode: (mode: LocalOnboardingMode) => Promise<LocalOnboardingSnapshot>;
  continue: () => Promise<LocalOnboardingSnapshot>;
  refresh: () => Promise<LocalOnboardingSnapshot>;
  onStateChange: (callback: (snapshot: LocalOnboardingSnapshot) => void) => () => void;
}

contextBridge.exposeInMainWorld('xpodDesktop', {
  // Provider 管理
  provider: {
    list: (): Promise<SolidProvider[]> =>
      ipcRenderer.invoke('provider:list'),
    get: (id: string): Promise<SolidProvider | undefined> =>
      ipcRenderer.invoke('provider:get', id),
    getDefault: (): Promise<SolidProvider | undefined> =>
      ipcRenderer.invoke('provider:getDefault'),
    add: (provider: SolidProvider): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('provider:add', provider),
    update: (id: string, updates: Partial<SolidProvider>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('provider:update', id, updates),
    remove: (id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('provider:remove', id),
    setDefault: (id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('provider:setDefault', id),
    detect: (url: string): Promise<{
      success: boolean;
      issuer?: string;
      name?: string;
      error?: string;
    }> => ipcRenderer.invoke('provider:detect', url),
  },

  // xpod 管理
  xpod: {
    start: (options: XpodStartOptions): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('xpod:start', options),
    stop: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('xpod:stop'),
    restart: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('xpod:restart'),
    status: (): Promise<XpodStatus> =>
      ipcRenderer.invoke('xpod:status'),
    healthCheck: (): Promise<boolean> =>
      ipcRenderer.invoke('xpod:healthCheck'),
  },

  // 配置管理
  config: {
    getAll: (): Promise<Record<string, string>> =>
      ipcRenderer.invoke('config:getAll'),
    getSchema: (): Promise<any> =>
      ipcRenderer.invoke('config:getSchema'),
    getPath: (): Promise<string> =>
      ipcRenderer.invoke('config:getPath'),
    update: (updates: Record<string, string>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('config:update', updates),
    reset: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('config:reset'),
  },

  // Supervisor（保留兼容）
  supervisor: {
    getStatus: () => ipcRenderer.invoke('supervisor:status'),
    onStatusChange: (callback: (data: any) => void) => {
      ipcRenderer.on('service-status', (_event, data) => callback(data));
    },
  },

  // 对话框
  dialog: {
    selectDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke('dialog:selectDirectory'),
  },

  app: {
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke('app:getVersion'),
    getConfigWindowState: (): Promise<{ open: boolean; reason: 'opened' | 'closed'; ready: boolean }> =>
      ipcRenderer.invoke('app:getConfigWindowState'),
    getUpdateStatus: (force = false): Promise<AppUpdateStatus> =>
      ipcRenderer.invoke('app:getUpdateStatus', force),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('app:openExternal', url),
    openConfigWindow: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('app:openConfigWindow'),
    closeConfigWindow: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('app:closeConfigWindow'),
    onConfigWindowState: (
      callback: (state: { open: boolean; reason: 'opened' | 'closed'; ready: boolean }) => void,
    ) => {
      const listener = (
        _event: unknown,
        state: { open: boolean; reason: 'opened' | 'closed'; ready: boolean },
      ) => callback(state);
      ipcRenderer.on('app:configWindowState', listener);
      return () => {
        ipcRenderer.removeListener('app:configWindowState', listener);
      };
    },
  },

  auth: {
    prepareLoopbackRedirect: (): Promise<string> =>
      ipcRenderer.invoke('auth:prepareLoopbackRedirect'),
    getEmbeddedAuthorizationState: (): Promise<{ open: boolean; reason: 'opened' | 'completed' | 'dismissed'; ready: boolean }> =>
      ipcRenderer.invoke('auth:getEmbeddedAuthorizationState'),
    openAuthorizationWindow: (url: string, options?: { providerLabel?: string }): Promise<void> =>
      ipcRenderer.invoke('auth:openAuthorizationWindow', url, options),
    openEmbeddedAuthorization: (url: string, options?: { providerLabel?: string }): Promise<void> =>
      ipcRenderer.invoke('auth:openEmbeddedAuthorization', url, options),
    closeEmbeddedAuthorization: (): Promise<void> =>
      ipcRenderer.invoke('auth:closeEmbeddedAuthorization'),
    consumePendingRedirect: (): Promise<string | null> =>
      ipcRenderer.invoke('auth:consumePendingRedirect'),
    onAuthorizationWindowState: (
      callback: (state: { open: boolean; reason: 'opened' | 'completed' | 'dismissed' }) => void,
    ) => {
      const listener = (
        _event: unknown,
        state: { open: boolean; reason: 'opened' | 'completed' | 'dismissed' },
      ) => callback(state);
      ipcRenderer.on('auth:windowState', listener);
      return () => {
        ipcRenderer.removeListener('auth:windowState', listener);
      };
    },
    onEmbeddedAuthorizationState: (
      callback: (state: { open: boolean; reason: 'opened' | 'completed' | 'dismissed'; ready: boolean }) => void,
    ) => {
      const listener = (
        _event: unknown,
        state: { open: boolean; reason: 'opened' | 'completed' | 'dismissed'; ready: boolean },
      ) => callback(state);
      ipcRenderer.on('auth:embeddedState', listener);
      return () => {
        ipcRenderer.removeListener('auth:embeddedState', listener);
      };
    },
    onRedirect: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('auth:redirect', listener);
      return () => {
        ipcRenderer.removeListener('auth:redirect', listener);
      };
    },
  },

  localOnboarding: {
    getSnapshot: (): Promise<LocalOnboardingSnapshot> =>
      ipcRenderer.invoke('localOnboarding:getSnapshot'),
    chooseMode: (mode: LocalOnboardingMode): Promise<LocalOnboardingSnapshot> =>
      ipcRenderer.invoke('localOnboarding:chooseMode', mode),
    continue: (): Promise<LocalOnboardingSnapshot> =>
      ipcRenderer.invoke('localOnboarding:continue'),
    refresh: (): Promise<LocalOnboardingSnapshot> =>
      ipcRenderer.invoke('localOnboarding:refresh'),
    onStateChange: (callback: (snapshot: LocalOnboardingSnapshot) => void) => {
      const listener = (_event: unknown, snapshot: LocalOnboardingSnapshot) => callback(snapshot);
      ipcRenderer.on('localOnboarding:state', listener);
      return () => {
        ipcRenderer.removeListener('localOnboarding:state', listener);
      };
    },
  },
});
