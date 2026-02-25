import { contextBridge, ipcRenderer } from 'electron';

// Provider 类型
export interface ManagedPodConfig {
  status: 'stopped' | 'starting' | 'running' | 'error';
  dataDir: string;
  port: number;
  domain: {
    type: 'none' | 'undefineds' | 'custom';
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
    type: 'none' | 'undefineds' | 'custom';
    value?: string;
  };
  tunnelToken?: string;
}

export interface XpodStatus {
  running: boolean;
  providerId?: string;
  port?: number;
  baseUrl?: string;
  pid?: number;
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
});
