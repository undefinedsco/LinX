import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { Supervisor } from '../../lib/supervisor';
import { ConfigManager } from './lib/config-manager';

let mainWindow: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const supervisor = new Supervisor();
const configManager = new ConfigManager();

// xpod 服务器的路径（相对于 desktop 目录的上级）
const XPOD_ROOT = path.join(__dirname, '..', '..');

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

  // 等待服务启动后加载
  setTimeout(() => {
    mainWindow?.loadURL('http://localhost:3000');
  }, 3000);

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

  // 加载配置页面
  configWindow.loadFile(path.join(__dirname, 'pages', 'config.html'));

  configWindow.on('closed', () => {
    configWindow = null;
  });
}

function createTray(): void {
  // 创建一个简单的托盘图标（16x16 空白图标作为占位）
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
          label: '启动服务',
          click: () => supervisor.start('xpod'),
        },
        {
          label: '停止服务',
          click: () => supervisor.stop('xpod'),
        },
        {
          label: '重启服务',
          click: async () => {
            await supervisor.stop('xpod');
            supervisor.start('xpod');
          },
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

  // 点击托盘图标显示窗口
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
}

function setupSupervisor(): void {
  // 获取环境变量配置
  const envConfig = configManager.getAll();

  // 注册 xpod 服务
  supervisor.register({
    name: 'xpod',
    command: 'node',
    args: ['dist/index.js'],
    cwd: XPOD_ROOT,
    env: {
      NODE_ENV: 'production',
      ...envConfig,
    },
  });

  // 状态变化时通知渲染进程
  supervisor.setStatusChangeHandler((name, state) => {
    mainWindow?.webContents.send('service-status', { name, state });
  });
}

function setupIPC(): void {
  // Supervisor IPC
  ipcMain.handle('supervisor:status', () => {
    return supervisor.getAllStatus();
  });

  ipcMain.handle('supervisor:start', (_event, name: string) => {
    supervisor.start(name);
    return { success: true };
  });

  ipcMain.handle('supervisor:stop', async (_event, name: string) => {
    await supervisor.stop(name);
    return { success: true };
  });

  ipcMain.handle('supervisor:restart', async (_event, name: string) => {
    await supervisor.stop(name);
    supervisor.start(name);
    return { success: true };
  });

  // Config IPC
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
}

app.whenReady().then(() => {
  setupSupervisor();
  setupIPC();
  
  // 启动服务
  supervisor.startAll();
  
  createWindow();
  createTray();

  app.on('activate', () => {
    // macOS: 点击 Dock 图标时重新显示窗口
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS: 关闭所有窗口不退出应用，服务继续后台运行
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  console.log('[Desktop] Stopping all services...');
  await supervisor.stopAll();
});
