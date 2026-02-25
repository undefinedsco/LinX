import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from 'electron';
import * as path from 'path';
import { Supervisor } from '../../../lib/supervisor';
import { ConfigManager } from './lib/config-manager';
import { ProviderManager, SolidProvider } from './lib/provider-manager';
import { XpodManager, XpodStartOptions } from './lib/xpod-manager';

let mainWindow: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const supervisor = new Supervisor();
const configManager = new ConfigManager();
const providerManager = new ProviderManager();
const xpodManager = new XpodManager(supervisor, configManager, providerManager);

function loadURLWithRetry(window: BrowserWindow, url: string, retries = 30) {
  return new Promise<void>(async (resolve, reject) => {
    for (let i = 0; i < retries; i++) {
      try {
        await window.loadURL(url);
        console.log(`[Desktop] Successfully loaded ${url}`);
        resolve();
        return;
      } catch (e: any) {
        if (e.code === 'ERR_CONNECTION_REFUSED') {
           console.log(`[Desktop] Connection refused, retrying in 1s... (${i + 1}/${retries})`);
           await new Promise(r => setTimeout(r, 1000));
        } else {
           console.error(`[Desktop] Failed to load URL: ${e.message}`);
           reject(e);
           return;
        }
      }
    }
    console.error('[Desktop] Failed to load URL after multiple retries.');
    reject(new Error('Connection timeout'));
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load URL with retry mechanism
  loadURLWithRetry(mainWindow, 'http://localhost:5173');

  // Open DevTools by default in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // macOS: 关闭窗口时隐藏而不是销毁
  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createConfigWindow(): void {
  if (configWindow) {
    configWindow.focus();
    return;
  }

  configWindow = new BrowserWindow({
    width: 700,
    height: 600,
    title: 'LinX 配置',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  configWindow.loadFile(path.join(__dirname, 'pages', 'config.html'));

  configWindow.on('closed', () => {
    configWindow = null;
  });
}

function createTray(): void {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开 LinX',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      },
    },
    {
      label: '配置',
      click: () => createConfigWindow(),
    },
    { type: 'separator' },
    {
      label: '服务状态',
      submenu: [
        {
          label: '查看状态',
          click: () => {
            const status = xpodManager.getStatus();
            console.log('[Desktop] xpod status:', status);
          },
        },
        {
          label: '停止服务',
          click: () => xpodManager.stop(),
        },
      ],
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('LinX Desktop');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
}

function setupIPC(): void {
  // 状态变化时通知渲染进程
  supervisor.setStatusChangeHandler((name, state) => {
    mainWindow?.webContents.send('service-status', { name, state });
  });

  // ===== Provider IPC =====
  ipcMain.handle('provider:list', () => {
    return providerManager.list();
  });

  ipcMain.handle('provider:get', (_event, id: string) => {
    return providerManager.get(id);
  });

  ipcMain.handle('provider:getDefault', () => {
    return providerManager.getDefault();
  });

  ipcMain.handle('provider:add', (_event, provider: SolidProvider) => {
    providerManager.add(provider);
    return { success: true };
  });

  ipcMain.handle('provider:update', (_event, id: string, updates: Partial<SolidProvider>) => {
    providerManager.update(id, updates);
    return { success: true };
  });

  ipcMain.handle('provider:remove', (_event, id: string) => {
    providerManager.remove(id);
    return { success: true };
  });

  ipcMain.handle('provider:setDefault', (_event, id: string) => {
    providerManager.setDefault(id);
    return { success: true };
  });

  ipcMain.handle('provider:detect', async (_event, url: string) => {
    return providerManager.detectProvider(url);
  });

  // ===== xpod IPC =====
  ipcMain.handle('xpod:start', async (_event, options: XpodStartOptions) => {
    await xpodManager.start(options);
    return { success: true };
  });

  ipcMain.handle('xpod:stop', async () => {
    await xpodManager.stop();
    return { success: true };
  });

  ipcMain.handle('xpod:restart', async () => {
    await xpodManager.restart();
    return { success: true };
  });

  ipcMain.handle('xpod:status', () => {
    return xpodManager.getStatus();
  });

  ipcMain.handle('xpod:healthCheck', async () => {
    return xpodManager.healthCheck();
  });

  // ===== Config IPC =====
  ipcMain.handle('config:getAll', () => {
    return configManager.getAll();
  });

  ipcMain.handle('config:getSchema', () => {
    return configManager.getSchema();
  });

  ipcMain.handle('config:getPath', () => {
    return configManager.getConfigPath();
  });

  ipcMain.handle('config:update', (_event, updates: Record<string, string>) => {
    configManager.update(updates);
    return { success: true };
  });

  ipcMain.handle('config:reset', () => {
    configManager.reset();
    return { success: true };
  });

  // ===== Legacy Supervisor IPC (保留兼容) =====
  ipcMain.handle('supervisor:status', () => {
    return supervisor.getAllStatus();
  });

  // ===== Dialog IPC =====
  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择数据目录',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
}

app.whenReady().then(() => {
  setupIPC();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  console.log('[Desktop] Stopping all services...');
  await supervisor.stopAll();
});
