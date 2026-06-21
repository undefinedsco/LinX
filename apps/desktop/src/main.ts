import './lib/stdio-error-guard';
import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell, Notification, screen } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { Supervisor } from '../../../lib/supervisor';
import { ConfigManager } from './lib/config-manager';
import { ProviderManager, SolidProvider } from './lib/provider-manager';
import { XpodManager, XpodStartOptions } from './lib/xpod-manager';
import { resolveRendererTarget } from './lib/renderer-target';
import { RendererStaticServer, resolveRendererServerPort } from './lib/renderer-server';
import { formatXpodStatusDetail, getXpodDashboardUrl } from './lib/xpod-ui';
import { getTrayPresentation } from './lib/tray-presentation';
import { extractLinxAuthCallbackUrl, isDesktopAuthCallbackUrl } from './lib/auth-protocol';
import { installAuthCallbackNavigationInterceptor } from './lib/auth-callback-navigation';
import { AuthLoopbackServer } from './lib/auth-loopback';
import {
  addEmbeddedAuthQuery,
  installXpodAuthEnhancer,
  installXpodAuthEnhancerOnNewDocument,
} from './lib/xpod-auth-enhancer';
import {
  AUTHORIZATION_SURFACE_HEIGHT,
  AUTHORIZATION_SURFACE_WIDTH,
  EmbeddedAuthorizationSheet,
  resolveAuthorizationWindowTitle,
} from './lib/embedded-auth-sheet';
import { EmbeddedXpodSettingsSheet } from './lib/embedded-xpod-settings-sheet';
import { installSingleSurfaceWindowOpenHandler } from './lib/window-open-routing';
import {
  resolveEffectiveManagedDomain,
  resolveEffectiveManagedTunnelToken,
  resolveManagedDomainFromEnv,
} from './lib/local-provider-config';
import {
  installLocalSpSessionRoutes,
  resolveLocalSpOidcIssuer,
  updateLocalSpSessionRouteFromSnapshot,
  updateLocalSpSessionRouteFromStatus,
} from './lib/local-sp-session-route';
import {
  LocalOnboardingController,
  type LocalSpaceKind,
  type LocalOnboardingSnapshot,
} from './lib/local-onboarding';
import { applyLinxLocalHomeToElectronUserData, ensureLinxLocalHome } from './lib/local-home';
import buildMeta from './generated/build-meta.json';
import { AppUpdater } from './lib/app-updater';
import { createAppUpdateNotice, shouldNotifyAppUpdate } from './lib/app-update-notice';

let mainWindow: BrowserWindow | null = null;
let xpodWindow: BrowserWindow | null = null;
let authWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayRefreshTimer: NodeJS.Timeout | null = null;
let isQuitting = false;
let lastNotifiedUpdateVersion: string | null = null;
let pendingAuthRedirectUrl: string | null = extractLinxAuthCallbackUrl(process.argv);
let authWindowCloseReason: 'completed' | 'dismissed' = 'dismissed';
applyLinxLocalHomeToElectronUserData();
const localPaths = ensureLinxLocalHome();

const supervisor = new Supervisor();
const configManager = new ConfigManager();
const providerManager = new ProviderManager();
const xpodManager = new XpodManager(supervisor, configManager, providerManager);
const rendererStaticServer = new RendererStaticServer({
  preferredPort: resolveRendererServerPort(process.env),
  onError: (error) => {
    console.warn('[Desktop] Renderer static server warning:', error);
  },
});
const embeddedAuthorizationSheet = new EmbeddedAuthorizationSheet({
  getMainWindow: () => mainWindow,
  onCallbackUrl: (url) => {
    authWindowCloseReason = 'completed';
    queueAuthRedirect(url);
  },
  onStateChange: (state) => {
    notifyEmbeddedAuthorizationState(state);
  },
});
const embeddedXpodSettingsSheet = new EmbeddedXpodSettingsSheet({
  getMainWindow: () => mainWindow,
  onStateChange: (state) => {
    notifyConfigWindowState(state);
    if (!state.open) {
      revealMainWindow();
      try {
        mainWindow?.webContents.focus();
      } catch {
        // ignore focus errors during recovery
      }
      void localOnboarding.refresh().catch((error) => {
        console.warn('[Desktop] Failed to refresh Local onboarding state after closing settings:', error);
      });
    }
  },
});
const localOnboarding = new LocalOnboardingController({
  xpodManager,
  ensureBootstrapProvider: (spaceKind) => ensureBootstrapLocalProvider(spaceKind),
  updateProvider: (id, updates) => providerManager.update(id, updates),
  stateDir: localPaths.home,
  onSnapshotChange: (snapshot) => {
    publishLocalOnboardingSnapshot(snapshot);
  },
});
const authLoopbackServer = new AuthLoopbackServer({
  onCallback: (url) => {
    authWindowCloseReason = 'completed';
    queueAuthRedirect(url);
    setTimeout(() => {
      if (authWindow && !authWindow.isDestroyed()) {
        authWindow.close();
      }
      authWindow = null;
      embeddedAuthorizationSheet.close('completed');
    }, 120);
  },
  onError: (error) => {
    console.error('[Desktop] Auth loopback server error:', error);
  },
});
const appUpdater = new AppUpdater({
  currentVersion: process.env.LINX_APP_VERSION ?? app.getVersion() ?? buildMeta.version,
  releaseRepo: process.env.LINX_RELEASE_REPO ?? buildMeta.releaseRepo,
  releaseFeedUrl: process.env.LINX_RELEASE_FEED_URL,
});
const desktopAppIconPath = resolveDesktopAppIconPath();
const desktopAppIcon = desktopAppIconPath ? nativeImage.createFromPath(desktopAppIconPath) : null;
const shouldOpenDevTools = process.env.LINX_DESKTOP_OPEN_DEVTOOLS === '1';

function getIdleUpdateStatus() {
  return {
    currentVersion: appUpdater.getCurrentVersion(),
    latestVersion: null,
    releaseUrl: null,
    checkedAt: null,
    available: false,
    source: 'github-release' as const,
    error: null,
  };
}

function registerAppProtocol(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient('linx', process.execPath, [path.resolve(process.argv[1])]);
    return;
  }

  app.setAsDefaultProtocolClient('linx');
}

function resolveDesktopAppIconPath(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../build/icon.png'),
    path.resolve(__dirname, '../../../build/icon.png'),
    path.resolve(__dirname, '../../../../apps/desktop/build/icon.png'),
    path.resolve(process.cwd(), 'apps/desktop/build/icon.png'),
    path.resolve(process.cwd(), 'build/icon.png'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function applyDesktopAppIcon(): void {
  if (!desktopAppIcon || desktopAppIcon.isEmpty()) {
    return;
  }

  if (process.platform === 'darwin') {
    app.dock?.setIcon(desktopAppIcon);
  }
}

function revealMainWindow(): void {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  createWindow();
}

function notifyAuthRedirectAvailable(): void {
  if (!pendingAuthRedirectUrl) {
    return;
  }

  mainWindow?.webContents.send('auth:redirect');
}

function notifyAuthWindowState(state: { open: boolean; reason: 'opened' | 'completed' | 'dismissed' }): void {
  mainWindow?.webContents.send('auth:windowState', state);
}

function notifyEmbeddedAuthorizationState(state: { open: boolean; reason: 'opened' | 'completed' | 'dismissed'; ready: boolean }): void {
  mainWindow?.webContents.send('auth:embeddedState', state);
}

function notifyConfigWindowState(state: { open: boolean; reason: 'opened' | 'closed'; ready: boolean }): void {
  mainWindow?.webContents.send('app:configWindowState', state);
}

function publishLocalOnboardingSnapshot(snapshot: LocalOnboardingSnapshot): void {
  updateLocalSpSessionRouteFromSnapshot(snapshot);
  notifyLocalOnboardingState(snapshot);
}

function notifyLocalOnboardingState(snapshot: LocalOnboardingSnapshot): void {
  mainWindow?.webContents.send('localOnboarding:state', snapshot);
  if (snapshot.state === 'starting' || snapshot.state === 'ready' || snapshot.state === 'error') {
    void refreshTrayState().catch((error) => {
      console.error('[Desktop] Failed to refresh tray after Local onboarding state changed:', error);
    });
  }
}

function isRendererWindowLoaded(window: BrowserWindow): boolean {
  const currentUrl = window.webContents.getURL();
  if (!currentUrl) {
    return false;
  }

  const target = getRendererTarget();
  if (target.kind === 'url') {
    return currentUrl.startsWith(target.target);
  }

  const rendererBaseUrl = rendererStaticServer.getBaseUrl(target.target);
  return Boolean(rendererBaseUrl && currentUrl.startsWith(rendererBaseUrl));
}

async function ensureMainWindowReadyForAuthRedirect(): Promise<void> {
  revealMainWindow();

  if (!mainWindow) {
    return;
  }

  if (!isRendererWindowLoaded(mainWindow)) {
    await loadRenderer(mainWindow);
    return;
  }

  notifyAuthRedirectAvailable();
}

function queueAuthRedirect(url: string): void {
  if (!isDesktopAuthCallbackUrl(url)) {
    return;
  }

  pendingAuthRedirectUrl = url;

  if (app.isReady()) {
    void ensureMainWindowReadyForAuthRedirect().catch((error) => {
      console.error('[Desktop] Failed to prepare auth redirect:', error);
    });
  }
}

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

async function loadRenderer(window: BrowserWindow): Promise<void> {
  const target = getRendererTarget();

  if (target.kind === 'url') {
    await loadURLWithRetry(window, target.target);
    return;
  }

  const rendererUrl = await rendererStaticServer.prepareUrl(target.target);
  await loadURLWithRetry(window, rendererUrl);
}

function getRendererTarget() {
  return resolveRendererTarget({
    appIsPackaged: app.isPackaged,
    desktopDir: __dirname,
    cwd: process.cwd(),
    resourcesPath: app.isPackaged ? process.resourcesPath : undefined,
    env: process.env,
  });
}

function createWindow(): void {
  const rendererTarget = getRendererTarget();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: desktopAppIcon && !desktopAppIcon.isEmpty() ? desktopAppIcon : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  void loadRenderer(mainWindow).catch((error) => {
    console.error('[Desktop] Failed to load renderer:', error);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    notifyAuthRedirectAvailable();
  });

  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[Desktop:renderer:${level}] ${message} (${sourceId}:${line})`);
    });

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('[Desktop] Renderer failed to load:', {
        errorCode,
        errorDescription,
        validatedURL,
      });
    });
  }

  if (!app.isPackaged && shouldOpenDevTools) {
    mainWindow.webContents.openDevTools({ mode: 'bottom' });
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function closeConfigWindowIfOpen(): void {
  embeddedXpodSettingsSheet.close();
}

function closeAuthWindowIfOpen(reason: 'completed' | 'dismissed' = 'dismissed'): void {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindowCloseReason = reason
    authWindow.close()
  }
}

function closeEmbeddedAuthorizationIfOpen(reason: 'completed' | 'dismissed' = 'dismissed'): void {
  embeddedAuthorizationSheet.close(reason);
}

function hideWindowsForQuit(): void {
  for (const windowRef of [mainWindow, xpodWindow]) {
    if (windowRef && !windowRef.isDestroyed()) {
      windowRef.hide();
      windowRef.close();
    }
  }
}

async function createConfigWindow(): Promise<void> {
  closeAuthWindowIfOpen('dismissed')
  closeEmbeddedAuthorizationIfOpen('dismissed')

  const bootstrapProvider = ensureBootstrapLocalProvider();
  let status = await xpodManager.getStatus();

  if (!status.running && status.status !== 'starting') {
    await xpodManager.start({
      providerId: bootstrapProvider.id,
      dataDir: bootstrapProvider.managed!.dataDir,
      port: bootstrapProvider.managed!.port,
      spaceKind: bootstrapProvider.managed!.spaceKind ?? 'standalone',
      domain: bootstrapProvider.managed!.domain,
      tunnelToken: bootstrapProvider.managed!.tunnelToken,
    });
    status = await xpodManager.getStatus();
  }

  const dashboardUrl = getXpodDashboardUrl(status);
  if (!dashboardUrl) {
    throw new Error('当前没有可用的本地空间管理页');
  }

  await embeddedXpodSettingsSheet.open(dashboardUrl);
  const webContents = embeddedXpodSettingsSheet.getWebContents();
  if (webContents) {
    await focusXpodSettingsTab(webContents);
  }
}

interface AuthorizationWindowOptions {
  providerLabel?: string;
}

async function openAuthorizationWindow(url: string, options?: AuthorizationWindowOptions): Promise<void> {
  closeEmbeddedAuthorizationIfOpen('dismissed')
  closeConfigWindowIfOpen()
  const preparedUrl = await prepareAuthorizationUrlForLocal(url);
  await refreshLocalSpSessionRoute();
  const authUrl = addEmbeddedAuthQuery(preparedUrl)
  const title = resolveAuthorizationWindowTitle(options?.providerLabel)

  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.setTitle(title);
    authWindow.hide();
    await loadURLWithRetry(authWindow, authUrl, 5);
    await fitAuthWindowToContent(authWindow);
    scheduleAuthWindowRefit(authWindow);
    authWindow.show();
    authWindow.focus();
    return;
  }

  authWindow = new BrowserWindow({
    width: AUTHORIZATION_SURFACE_WIDTH,
    height: AUTHORIZATION_SURFACE_HEIGHT,
    minWidth: 380,
    minHeight: 500,
    title,
    autoHideMenuBar: true,
    icon: desktopAppIcon && !desktopAppIcon.isEmpty() ? desktopAppIcon : undefined,
    resizable: true,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    titleBarStyle: 'default',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: 'persist:linx-auth',
    },
  });

  authWindowCloseReason = 'dismissed';
  notifyAuthWindowState({ open: true, reason: 'opened' });
  installSingleSurfaceWindowOpenHandler(authWindow.webContents, {
    prepareSameOriginUrl: addEmbeddedAuthQuery,
  });
  installAuthCallbackNavigationInterceptor(authWindow.webContents, (callbackUrl) => {
    authWindowCloseReason = 'completed';
    queueAuthRedirect(callbackUrl);
    closeAuthWindowIfOpen('completed');
  });
  await installXpodAuthEnhancerOnNewDocument(authWindow.webContents).catch((error) => {
    console.warn('[Desktop] Failed to install xpod auth enhancer preload:', error);
  });

  authWindow.on('closed', () => {
    notifyAuthWindowState({ open: false, reason: authWindowCloseReason });
    authWindowCloseReason = 'dismissed';
    authWindow = null;
  });

  authWindow.webContents.on('did-finish-load', () => {
    const window = authWindow
    if (!window || window.isDestroyed()) {
      return;
    }

    void installXpodAuthEnhancer(window.webContents).catch((error) => {
      console.warn('[Desktop] Failed to install xpod auth enhancer:', error);
    });
    void fitAuthWindowToContent(window)
      .then(() => scheduleAuthWindowRefit(window))
      .catch((error) => {
        console.warn('[Desktop] Failed to refresh auth window after load:', error);
      });
  });

  authWindow.webContents.on('did-navigate-in-page', () => {
    const window = authWindow
    if (!window || window.isDestroyed()) {
      return;
    }

    void installXpodAuthEnhancer(window.webContents).catch((error) => {
      console.warn('[Desktop] Failed to install xpod auth enhancer:', error);
    });
    void fitAuthWindowToContent(window)
      .then(() => scheduleAuthWindowRefit(window))
      .catch((error) => {
        console.warn('[Desktop] Failed to refresh auth window after in-page navigation:', error);
      });
  });

  await loadURLWithRetry(authWindow, authUrl, 5);
  await installXpodAuthEnhancer(authWindow.webContents).catch((error) => {
    console.warn('[Desktop] Failed to install xpod auth enhancer:', error);
  });
  await fitAuthWindowToContent(authWindow);
  scheduleAuthWindowRefit(authWindow);
  authWindow.show();
  authWindow.focus();
}

async function openEmbeddedAuthorization(url: string, options?: AuthorizationWindowOptions): Promise<void> {
  closeAuthWindowIfOpen('dismissed');
  closeConfigWindowIfOpen();
  const preparedUrl = await prepareAuthorizationUrlForLocal(url);
  await refreshLocalSpSessionRoute();
  await embeddedAuthorizationSheet.open(preparedUrl, options);
}

async function refreshLocalSpSessionRoute(): Promise<void> {
  const status = await xpodManager.getStatus().catch(() => null);
  if (!status) {
    return;
  }
  updateLocalSpSessionRouteFromStatus(status);
}

async function prepareAuthorizationUrlForLocal(url: string): Promise<string> {
  const preparedUrl = await xpodManager.prepareLocalAuthorizationUrl(url);
  if (preparedUrl !== url) {
    await localOnboarding.refresh().catch((error) => {
      console.warn('[Desktop] Failed to refresh Local onboarding after provisioning refresh:', error);
    });
  }
  return preparedUrl;
}

async function fitAuthWindowToContent(window: BrowserWindow): Promise<void> {
  try {
    const display = screen.getDisplayMatching(window.getBounds());
    const width = clampWindowSize(AUTHORIZATION_SURFACE_WIDTH, AUTHORIZATION_SURFACE_WIDTH, Math.max(AUTHORIZATION_SURFACE_WIDTH, display.workAreaSize.width - 120));
    const height = clampWindowSize(AUTHORIZATION_SURFACE_HEIGHT, AUTHORIZATION_SURFACE_HEIGHT, Math.max(AUTHORIZATION_SURFACE_HEIGHT, display.workAreaSize.height - 120));

    window.setContentSize(width, height, true);
    window.center();
  } catch (error) {
    console.warn('[Desktop] Failed to fit auth window to content:', error);
  }
}

function scheduleAuthWindowRefit(window: BrowserWindow): void {
  for (const delay of [80, 220, 500, 1000, 1800]) {
    setTimeout(() => {
      if (!authWindow || authWindow !== window || window.isDestroyed()) {
        return
      }

      void fitAuthWindowToContent(window).catch((error) => {
        console.warn('[Desktop] Failed to refit auth window:', error)
      })
    }, delay)
  }
}

function clampWindowSize(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function openXpodDashboardWindow(): Promise<void> {
  const status = await xpodManager.getStatus();
  const dashboardUrl = getXpodDashboardUrl(status);

  if (!status.running || !dashboardUrl) {
    await dialog.showMessageBox({
      type: 'info',
      title: '本地空间未运行',
      message: '当前没有可用的本地空间管理页。',
      detail: formatXpodStatusDetail(status),
    });
    return;
  }

  if (!xpodWindow) {
    xpodWindow = new BrowserWindow({
      width: 1120,
      height: 800,
      title: '本地空间管理',
      icon: desktopAppIcon && !desktopAppIcon.isEmpty() ? desktopAppIcon : undefined,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    xpodWindow.on('closed', () => {
      xpodWindow = null;
    });
  } else {
    xpodWindow.show();
    xpodWindow.focus();
  }

  await loadURLWithRetry(xpodWindow, dashboardUrl, 10);
}

async function showXpodStatusDialog(): Promise<void> {
  const status = await xpodManager.getStatus();
  await dialog.showMessageBox({
    type: status.running ? 'info' : 'warning',
    title: '本地空间状态',
    message: status.running ? '本地空间运行中' : '本地空间未运行',
    detail: formatXpodStatusDetail(status),
  });
}

async function restartXpodFromTray(): Promise<void> {
  await xpodManager.restart();
  await showXpodStatusDialog();
}

async function stopXpodFromTray(): Promise<void> {
  await xpodManager.stop();
  await showXpodStatusDialog();
}

async function openXpodLogsDirectory(): Promise<void> {
  const { directory } = xpodManager.getLogPaths();
  await shell.openPath(directory);
}

async function openReleasePage(url: string | null): Promise<void> {
  if (!url) {
    return;
  }

  await shell.openExternal(url);
}

async function checkForUpdatesFromTray(): Promise<void> {
  const updateStatus = await appUpdater.getStatus(true);

  if (updateStatus.available && updateStatus.latestVersion) {
    await dialog.showMessageBox({
      type: 'info',
      title: '发现新版本',
      message: `当前版本 ${updateStatus.currentVersion}，最新版本 ${updateStatus.latestVersion}`,
      detail: updateStatus.releaseUrl
        ? `发布页面：${updateStatus.releaseUrl}`
        : '已检测到新版本，但当前没有可用的发布链接。',
    });
    return;
  }

  await dialog.showMessageBox({
    type: updateStatus.error ? 'warning' : 'info',
    title: updateStatus.error ? '检查更新失败' : '当前已是最新版本',
    message: updateStatus.error
      ? '未能完成更新检查'
      : `LinX ${updateStatus.currentVersion} 已是当前最新版本`,
    detail: updateStatus.error ?? `最近检查时间：${updateStatus.checkedAt ?? '未记录'}`,
  });
}

function notifyAvailableUpdate(updateStatus: Awaited<ReturnType<AppUpdater['getStatus']>>): void {
  if (!Notification.isSupported() || !shouldNotifyAppUpdate(lastNotifiedUpdateVersion, updateStatus)) {
    return;
  }

  const notice = createAppUpdateNotice(updateStatus);
  if (!notice) {
    return;
  }

  const notification = new Notification({
    title: notice.title,
    body: notice.body,
  });

  notification.on('click', () => {
    void openReleasePage(updateStatus.releaseUrl).catch((error) => {
      console.error('[Desktop] Failed to open release page from notification:', error);
    });
  });

  notification.show();
  lastNotifiedUpdateVersion = updateStatus.latestVersion;
}

async function startXpodFromTray(): Promise<void> {
  const resumed = await xpodManager.resume();
  if (!resumed) {
    await dialog.showMessageBox({
      type: 'info',
      title: '没有可启动的本地空间',
      message: '当前还没有配置好的本地空间。',
      detail: '请先在 LinX 中完成本地空间设置。',
    });
    return;
  }

  await showXpodStatusDialog();
}

function createTrayIcon() {
  if (process.platform === 'darwin') {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
        <rect x="2.5" y="2.5" width="13" height="13" rx="4" fill="#000000" />
        <path d="M6 5.5v7h6" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `.trim();
    const image = nativeImage
      .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
      .resize({ width: 18, height: 18 });
    image.setTemplateImage(true);
    return image;
  }

  if (desktopAppIcon && !desktopAppIcon.isEmpty()) {
    return desktopAppIcon.resize({ width: 18, height: 18 });
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <rect x="2" y="2" width="12" height="12" rx="3.5" fill="#7c3aed" />
      <path d="M5 4.5v7h5.8" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `.trim();

  return nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
    .resize({ width: 16, height: 16 });
}

async function refreshTrayState(): Promise<void> {
  if (!tray) {
    return;
  }

  const status = await xpodManager.getStatus();
  const presentation = getTrayPresentation(status);
  const dashboardUrl = getXpodDashboardUrl(status);
  const resumable = xpodManager.getResumableStartOptions();
  const updateStatus = app.isPackaged ? await appUpdater.getStatus() : getIdleUpdateStatus();
  const tooltip = updateStatus.available && updateStatus.latestVersion
    ? `${presentation.tooltip} · 可更新 ${updateStatus.latestVersion}`
    : presentation.tooltip;
  if (app.isPackaged) {
    notifyAvailableUpdate(updateStatus);
  }

  tray.setImage(createTrayIcon());
  tray.setTitle(presentation.title);
  tray.setToolTip(tooltip);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: presentation.statusLabel,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: '打开 LinX',
        click: () => {
          revealMainWindow();
        },
      },
      {
        label: '打开本地空间管理',
        enabled: Boolean(status.running && dashboardUrl),
        click: () => {
          void openXpodDashboardWindow().catch((error) => {
            console.error('[Desktop] Failed to open xpod dashboard:', error);
          });
        },
      },
      { type: 'separator' },
      {
        label: '查看本地空间状态',
        click: () => {
          void showXpodStatusDialog().catch((error) => {
            console.error('[Desktop] Failed to show xpod status:', error);
          });
        },
      },
      {
        label: status.running || status.status === 'starting' ? '重启本地空间' : '启动本地空间',
        enabled: Boolean((status.running || status.status === 'starting') || resumable),
        click: () => {
          const action = status.running || status.status === 'starting'
            ? restartXpodFromTray()
            : startXpodFromTray();
          void action
            .then(() => refreshTrayState())
            .catch((error) => {
              console.error('[Desktop] Failed to control xpod:', error);
            });
        },
      },
      {
        label: '停止本地空间',
        enabled: Boolean(status.running || status.status === 'starting'),
        click: () => {
          void stopXpodFromTray()
            .then(() => refreshTrayState())
            .catch((error) => {
              console.error('[Desktop] Failed to stop xpod:', error);
            });
        },
      },
      {
        label: '打开本地空间日志目录',
        click: () => {
          void openXpodLogsDirectory().catch((error) => {
            console.error('[Desktop] Failed to open xpod logs:', error);
          });
        },
      },
      { type: 'separator' },
      {
        label: `当前版本 ${updateStatus.currentVersion}`,
        enabled: false,
      },
      {
        label: updateStatus.available && updateStatus.latestVersion
          ? `发现新版本 ${updateStatus.latestVersion}`
          : updateStatus.error
          ? '更新检查失败'
          : '当前已是最新版本',
        enabled: false,
      },
      {
        label: '检查更新',
        click: () => {
          void checkForUpdatesFromTray()
            .then(() => refreshTrayState())
            .catch((error) => {
              console.error('[Desktop] Failed to check updates:', error);
            });
        },
      },
      {
        label: '查看最新发布',
        enabled: Boolean(updateStatus.releaseUrl),
        click: () => {
          void openReleasePage(updateStatus.releaseUrl).catch((error) => {
            console.error('[Desktop] Failed to open release page:', error);
          });
        },
      },
      { type: 'separator' },
      {
        label: '配置',
        click: () => {
          void createConfigWindow().catch((error) => {
            console.error('[Desktop] Failed to open Local setup window:', error);
          });
        },
      },
      { type: 'separator' },
      {
        label: '退出 LinX',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
}

function createTray(): void {
  tray = new Tray(createTrayIcon());
  void refreshTrayState().catch((error) => {
    console.error('[Desktop] Failed to initialize tray state:', error);
  });
  trayRefreshTimer = setInterval(() => {
    void refreshTrayState().catch((error) => {
      console.error('[Desktop] Failed to refresh tray state:', error);
    });
  }, 5000);

  tray.on('click', () => {
    void (async () => {
      const status = await xpodManager.getStatus();
      if (status.running && getXpodDashboardUrl(status)) {
        await openXpodDashboardWindow();
        return;
      }

      revealMainWindow();
    })().catch((error) => {
      console.error('[Desktop] Failed to handle xpod tray click:', error);
      revealMainWindow();
    });
  });

  tray.on('right-click', () => {
    void refreshTrayState().catch((error) => {
      console.error('[Desktop] Failed to refresh tray state:', error);
    });
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

  ipcMain.handle('xpod:upgrade', async () => {
    await xpodManager.upgradeRuntime();
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

  ipcMain.handle('app:getVersion', () => {
    return appUpdater.getCurrentVersion();
  });

  ipcMain.handle('app:getConfigWindowState', () => {
    return embeddedXpodSettingsSheet.getState();
  });

  ipcMain.handle('app:getUpdateStatus', (_event, force?: boolean) => {
    return appUpdater.getStatus(Boolean(force));
  });

  ipcMain.handle('app:openExternal', (_event, url: string) => {
    return shell.openExternal(url);
  });

  ipcMain.handle('app:openConfigWindow', () => {
    return createConfigWindow().then(() => ({ success: true }));
  });

  ipcMain.handle('app:closeConfigWindow', () => {
    closeConfigWindowIfOpen();
    return { success: true };
  });

  ipcMain.handle('localOnboarding:getSnapshot', async () => {
    return localOnboarding.refresh();
  });

  ipcMain.handle('localOnboarding:chooseSpace', async (_event, spaceKind: LocalSpaceKind) => {
    return localOnboarding.chooseSpace(spaceKind);
  });

  ipcMain.handle('localOnboarding:continue', async () => {
    return localOnboarding.continue();
  });

  ipcMain.handle('localOnboarding:refresh', async () => {
    return localOnboarding.refresh();
  });

  ipcMain.handle('localOnboarding:saveTunnelToken', async (_event, input: { token?: string }) => {
    return localOnboarding.saveTunnelToken({
      provider: 'cloudflare',
      token: input?.token ?? '',
    });
  });

  ipcMain.handle('localOnboarding:saveNetworkConfig', async (_event, input: {
    publicDomain?: string | null
    tunnelProvider?: 'cloudflare' | null
    tunnelToken?: string | null
  }) => {
    return localOnboarding.saveNetworkConfig({
      publicDomain: input?.publicDomain,
      tunnelProvider: input?.tunnelProvider ?? 'cloudflare',
      tunnelToken: input?.tunnelToken,
    });
  });

  ipcMain.handle('localOnboarding:testConnectivity', async () => {
    return localOnboarding.testConnectivity();
  });

  ipcMain.handle('auth:prepareLoopbackRedirect', () => {
    return authLoopbackServer.prepareRedirectUrl();
  });

  ipcMain.handle('auth:resolveOidcIssuer', async (_event, url: string) => {
    await refreshLocalSpSessionRoute();
    return resolveLocalSpOidcIssuer(url);
  });

  ipcMain.handle('auth:getEmbeddedAuthorizationState', () => {
    return embeddedAuthorizationSheet.getState();
  });

  ipcMain.handle('auth:openAuthorizationWindow', (_event, url: string, options?: AuthorizationWindowOptions) => {
    return openAuthorizationWindow(url, options);
  });

  ipcMain.handle('auth:openEmbeddedAuthorization', (_event, url: string, options?: AuthorizationWindowOptions) => {
    return openEmbeddedAuthorization(url, options);
  });

  ipcMain.handle('auth:closeEmbeddedAuthorization', () => {
    closeEmbeddedAuthorizationIfOpen('dismissed');
  });

  ipcMain.handle('auth:consumePendingRedirect', () => {
    const redirectUrl = pendingAuthRedirectUrl;
    pendingAuthRedirectUrl = null;
    return redirectUrl;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const protocolUrl = extractLinxAuthCallbackUrl(argv);
    if (protocolUrl) {
      queueAuthRedirect(protocolUrl);
      return;
    }

    revealMainWindow();
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    queueAuthRedirect(url);
  });

  app.whenReady().then(() => {
    applyDesktopAppIcon();
    registerAppProtocol();
    installLocalSpSessionRoutes();
    ensureBootstrapLocalProvider();
    setupIPC();
    createWindow();
    createTray();

    app.on('activate', () => {
      revealMainWindow();
    });
  });
}

app.on('window-all-closed', () => {
  // Keep the desktop shell resident so the tray can control the detached xpod.
});

app.on('before-quit', async () => {
  isQuitting = true;
  hideWindowsForQuit();
  if (trayRefreshTimer) {
    clearInterval(trayRefreshTimer);
    trayRefreshTimer = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
  await authLoopbackServer.stop().catch((error) => {
    console.error('[Desktop] Failed to stop auth loopback server:', error);
  });
  await rendererStaticServer.stop().catch((error) => {
    console.error('[Desktop] Failed to stop renderer static server:', error);
  });
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close();
    authWindow = null;
  }
  embeddedAuthorizationSheet.dispose();
  embeddedXpodSettingsSheet.dispose();
  console.log('[Desktop] LinX desktop shell is quitting; local xpod services stay resident.');
});

function ensureBootstrapLocalProvider(spaceKind: LocalSpaceKind | null = null): SolidProvider {
  const managedProviders = providerManager.getManagedPods();
  const existingManaged = managedProviders[0];
  const env = configManager.getAll();
  const port = parseEnvPort(env.CSS_PORT);
  const dataDir = path.resolve(env.CSS_ROOT_FILE_PATH || localPaths.podDir);
  const providerId = existingManaged?.id ?? 'local';
  const status = existingManaged?.managed?.status ?? 'stopped';
  const envDomain = resolveManagedDomainFromEnv(env);
  const existingDomain = existingManaged?.managed?.domain;
  const existingTunnelToken = existingManaged?.managed?.tunnelToken;
  const existingSpaceKind = existingManaged?.managed?.spaceKind === 'local' || existingManaged?.managed?.spaceKind === 'standalone'
    ? existingManaged.managed.spaceKind
    : null;
  const selectedSpaceKind = spaceKind ?? existingSpaceKind;
  const managedDomain = resolveEffectiveManagedDomain({
    spaceKind: selectedSpaceKind,
    envDomain,
    existingDomain,
  });
  const managedTunnelToken = resolveEffectiveManagedTunnelToken({
    env,
    spaceKind: selectedSpaceKind,
    domain: managedDomain,
    existingTunnelToken,
  });

  const provider: SolidProvider = {
    id: providerId,
    name: 'Local',
    issuerUrl: `http://localhost:${port}`,
    isDefault: false,
    managed: {
      status,
      dataDir,
      port,
      spaceKind: selectedSpaceKind,
      domain: managedDomain,
      tunnelToken: managedTunnelToken,
    },
  };

  if (providerManager.get(providerId)) {
    providerManager.update(providerId, provider);
  } else {
    providerManager.add(provider);
  }

  for (const extraProvider of managedProviders.slice(1)) {
    providerManager.remove(extraProvider.id);
  }

  return providerManager.get(providerId) ?? provider;
}

function parseEnvPort(portValue: string | undefined): number {
  const parsed = Number(portValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5737;
}

async function focusXpodSettingsTab(webContents: Pick<Electron.WebContents, 'executeJavaScript'>): Promise<void> {
  await webContents.executeJavaScript(`
    (() => {
      const openSettings = () => {
        const candidates = Array.from(document.querySelectorAll('button'));
        const settingsButton = candidates.find((button) => button.textContent?.trim() === '设置');
        if (!settingsButton) {
          return false;
        }
        settingsButton.click();
        return true;
      };

      if (openSettings()) {
        return true;
      }

      const observer = new MutationObserver(() => {
        if (openSettings()) {
          observer.disconnect();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 5000);
      return false;
    })();
  `);
}
