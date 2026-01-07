import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('xpodDesktop', {
  supervisor: {
    getStatus: () => ipcRenderer.invoke('supervisor:status'),
    start: (name: string) => ipcRenderer.invoke('supervisor:start', name),
    stop: (name: string) => ipcRenderer.invoke('supervisor:stop', name),
    restart: (name: string) => ipcRenderer.invoke('supervisor:restart', name),
    onStatusChange: (callback: (data: any) => void) => {
      ipcRenderer.on('service-status', (_event, data) => callback(data));
    },
  },
  config: {
    getAll: () => ipcRenderer.invoke('config:getAll'),
    getSchema: () => ipcRenderer.invoke('config:getSchema'),
    getPath: () => ipcRenderer.invoke('config:getPath'),
    update: (updates: Record<string, string>) => ipcRenderer.invoke('config:update', updates),
    reset: () => ipcRenderer.invoke('config:reset'),
  },
});
