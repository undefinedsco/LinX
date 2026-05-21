import { BrowserWindow } from 'electron';
import { addEmbeddedAuthQuery, installXpodAuthEnhancer } from './xpod-auth-enhancer';
import { installSingleSurfaceWindowOpenHandler } from './window-open-routing';

export type EmbeddedAuthorizationCloseReason = 'opened' | 'completed' | 'dismissed';

export interface EmbeddedAuthorizationState {
  open: boolean;
  reason: EmbeddedAuthorizationCloseReason;
  ready: boolean;
}

interface EmbeddedAuthorizationSheetOptions {
  getMainWindow: () => BrowserWindow | null;
  onStateChange?: (state: EmbeddedAuthorizationState) => void;
}

export interface EmbeddedAuthorizationOpenOptions {
  providerLabel?: string;
}

export const AUTHORIZATION_SURFACE_WIDTH = 480;
export const AUTHORIZATION_SURFACE_HEIGHT = 720;

export class EmbeddedAuthorizationSheet {
  private readonly getMainWindow: () => BrowserWindow | null;
  private readonly onStateChange?: (state: EmbeddedAuthorizationState) => void;
  private window: BrowserWindow | null = null;
  private isOpen = false;
  private openToken = 0;
  private pendingProvisionCode: string | null = null;
  private state: EmbeddedAuthorizationState = {
    open: false,
    reason: 'dismissed',
    ready: false,
  };

  public constructor(options: EmbeddedAuthorizationSheetOptions) {
    this.getMainWindow = options.getMainWindow;
    this.onStateChange = options.onStateChange;
  }

  public async open(url: string, options?: EmbeddedAuthorizationOpenOptions): Promise<void> {
    const mainWindow = this.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Main window is not ready.');
    }

    const openToken = ++this.openToken;
    this.pendingProvisionCode = extractProvisionCode(url);
    const targetUrl = addEmbeddedAuthQuery(url);
    const title = resolveAuthorizationWindowTitle(options?.providerLabel);

    if (this.window && !this.window.isDestroyed()) {
      this.window.setTitle(title);
      this.window.focus();
      this.window.loadURL(targetUrl);
      this.emitState({ open: true, reason: 'opened', ready: true });
      return;
    }

    this.window = new BrowserWindow({
      width: AUTHORIZATION_SURFACE_WIDTH,
      height: AUTHORIZATION_SURFACE_HEIGHT,
      minWidth: 380,
      minHeight: 500,
      title,
      autoHideMenuBar: true,
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

    installSingleSurfaceWindowOpenHandler(this.window.webContents, {
      prepareSameOriginUrl: addEmbeddedAuthQuery,
    });

    this.window.webContents.on('did-finish-load', () => {
      void this.installProvisionCode();
      void this.installAuthEnhancer();
    });

    this.window.webContents.on('did-navigate-in-page', () => {
      void this.installProvisionCode();
      void this.installAuthEnhancer();
    });

    this.window.on('closed', () => {
      this.window = null;
      if (this.isOpen) {
        this.emitState({ open: false, reason: 'dismissed', ready: false });
      }
    });

    this.window.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape') {
        event.preventDefault();
        this.close('dismissed');
      }
    });

    this.emitState({ open: true, reason: 'opened', ready: false });

    try {
      await loadURLWithRetry(this.window.webContents, targetUrl, 5);
      if (!this.isRequestCurrent(openToken)) {
        return;
      }

      await this.installProvisionCode();
      await this.installAuthEnhancer();
      this.window.show();
      this.emitState({ open: true, reason: 'opened', ready: true });
    } catch (error) {
      if (this.isRequestCurrent(openToken)) {
        this.destroyWindow();
        this.emitState({ open: false, reason: 'dismissed', ready: false });
      }
      throw error;
    }
  }

  public close(reason: Exclude<EmbeddedAuthorizationCloseReason, 'opened'> = 'dismissed'): void {
    this.openToken += 1;
    this.destroyWindow();
    this.emitState({ open: false, reason, ready: false });
  }

  public getState(): EmbeddedAuthorizationState {
    return { ...this.state };
  }

  public dispose(): void {
    this.openToken += 1;
    this.destroyWindow();
  }

  private destroyWindow(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
    this.window = null;
  }

  private emitState(state: EmbeddedAuthorizationState): void {
    if (
      this.state.open === state.open
      && this.state.reason === state.reason
      && this.state.ready === state.ready
    ) {
      return;
    }

    this.isOpen = state.open;
    this.state = { ...state };
    this.onStateChange?.(state);
  }

  private isRequestCurrent(openToken: number): boolean {
    return this.isOpen && this.openToken === openToken;
  }

  private async installAuthEnhancer(): Promise<void> {
    const window = this.window;
    if (!window || window.isDestroyed()) {
      return;
    }

    try {
      await installXpodAuthEnhancer(window.webContents);
    } catch (error) {
      console.warn('[Desktop] Failed to install xpod auth enhancer:', error);
    }
  }

  private async installProvisionCode(): Promise<void> {
    const window = this.window;
    if (!window || window.isDestroyed() || !this.pendingProvisionCode) {
      return;
    }

    try {
      await window.webContents.executeJavaScript(
        `try { window.sessionStorage.setItem('provisionCode', ${JSON.stringify(this.pendingProvisionCode)}); } catch {}`,
        true,
      );
    } catch (error) {
      console.warn('[Desktop] Failed to persist provision code in auth surface:', error);
    }
  }
}

export function resolveAuthorizationWindowTitle(providerLabel?: string): string {
  const label = sanitizeProviderLabel(providerLabel);
  return label ? `${label} 登录` : 'LinX 登录';
}

function sanitizeProviderLabel(providerLabel?: string): string | null {
  const trimmed = providerLabel?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 32);
}

export function extractProvisionCode(url: string): string | null {
  try {
    const parsed = new URL(url);
    const value = parsed.searchParams.get('provisionCode');
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function clampWindowSize(preferred: number, min: number, max: number): number {
  return Math.max(min, Math.min(preferred, max));
}

async function loadURLWithRetry(
  webContents: Electron.WebContents,
  url: string,
  retries: number,
): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await webContents.loadURL(url);
      return;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
