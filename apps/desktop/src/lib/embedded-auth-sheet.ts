import { BrowserWindow } from 'electron';
import {
  addEmbeddedAuthQuery,
  installXpodAuthEnhancer,
  installXpodAuthEnhancerOnNewDocument,
} from './xpod-auth-enhancer';
import { installAuthCallbackNavigationInterceptor } from './auth-callback-navigation';
import { installSingleSurfaceWindowOpenHandler } from './window-open-routing';
import { AUTH_SESSION_PARTITION } from './local-sp-session-route';

export type EmbeddedAuthorizationCloseReason = 'opened' | 'completed' | 'dismissed';

export interface EmbeddedAuthorizationState {
  open: boolean;
  reason: EmbeddedAuthorizationCloseReason;
  ready: boolean;
}

interface EmbeddedAuthorizationSheetOptions {
  getMainWindow: () => BrowserWindow | null;
  onCallbackUrl?: (url: string) => void;
  onStateChange?: (state: EmbeddedAuthorizationState) => void;
}

export interface EmbeddedAuthorizationOpenOptions {
  providerLabel?: string;
}

export const AUTHORIZATION_SURFACE_WIDTH = 480;
export const AUTHORIZATION_SURFACE_HEIGHT = 720;

export class EmbeddedAuthorizationSheet {
  private readonly getMainWindow: () => BrowserWindow | null;
  private readonly onCallbackUrl?: (url: string) => void;
  private readonly onStateChange?: (state: EmbeddedAuthorizationState) => void;
  private window: BrowserWindow | null = null;
  private isOpen = false;
  private openToken = 0;
  private pendingProvisionCode: string | null = null;
  private currentProviderLabel: string | null = null;
  private state: EmbeddedAuthorizationState = {
    open: false,
    reason: 'dismissed',
    ready: false,
  };

  public constructor(options: EmbeddedAuthorizationSheetOptions) {
    this.getMainWindow = options.getMainWindow;
    this.onCallbackUrl = options.onCallbackUrl;
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
    this.currentProviderLabel = sanitizeProviderLabel(options?.providerLabel);
    const title = resolveAuthorizationWindowTitle(this.currentProviderLabel ?? undefined);

    if (this.window && !this.window.isDestroyed()) {
      this.window.setTitle(title);
      this.window.loadURL(targetUrl);
      this.showWindow();
      this.emitState({ open: true, reason: 'opened', ready: true });
      return;
    }

    this.window = new BrowserWindow({
      parent: mainWindow,
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
        partition: AUTH_SESSION_PARTITION,
      },
    });

    installSingleSurfaceWindowOpenHandler(this.window.webContents, {
      prepareSameOriginUrl: addEmbeddedAuthQuery,
    });
    installAuthCallbackNavigationInterceptor(this.window.webContents, (callbackUrl) => {
      this.onCallbackUrl?.(callbackUrl);
      this.close('completed');
    });
    this.emitState({ open: true, reason: 'opened', ready: false });
    await this.installAuthEnhancerOnNewDocument();

    this.window.webContents.on('did-finish-load', () => {
      void this.installNavigationControls();
      void this.installProvisionCode();
      void this.installAuthEnhancer();
    });

    this.window.webContents.on('did-navigate-in-page', () => {
      void this.installNavigationControls();
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

    try {
      await loadURLWithRetry(this.window.webContents, targetUrl, 5);
      if (!this.isRequestCurrent(openToken)) {
        return;
      }

      await this.installNavigationControls();
      await this.installProvisionCode();
      await this.installAuthEnhancer();
      this.showWindow();
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

  private showWindow(): void {
    const window = this.window;
    if (!window || window.isDestroyed()) {
      return;
    }

    window.show();
    if (typeof window.moveTop === 'function') {
      window.moveTop();
    }
    window.focus();
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

  private async installAuthEnhancerOnNewDocument(): Promise<void> {
    const window = this.window;
    if (!window || window.isDestroyed()) {
      return;
    }

    try {
      await installXpodAuthEnhancerOnNewDocument(window.webContents, this.pendingProvisionCode);
    } catch (error) {
      console.warn('[Desktop] Failed to install xpod auth enhancer preload:', error);
    }
  }

  private async installNavigationControls(): Promise<void> {
    const window = this.window;
    if (!window || window.isDestroyed()) {
      return;
    }

    try {
      await window.webContents.executeJavaScript(
        buildEmbeddedAuthorizationControlsScript(this.currentProviderLabel ?? undefined),
        true,
      );
    } catch (error) {
      console.warn('[Desktop] Failed to install embedded auth controls:', error);
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

export function buildEmbeddedAuthorizationControlsScript(providerLabel?: string): string {
  const label = sanitizeProviderLabel(providerLabel);
  return [
    '(() => {',
    '  const ROOT_ID = "linx-embedded-auth-controls";',
    `  const providerLabel = ${JSON.stringify(label)};`,
    '  const install = () => {',
    '    const host = document.body || document.documentElement;',
    '    if (!host) return "no-host";',
    '    let root = document.getElementById(ROOT_ID);',
    '    if (!root) {',
    '      root = document.createElement("div");',
    '      root.id = ROOT_ID;',
    '      root.setAttribute("data-linx-role", "embedded-auth-controls");',
    '      Object.assign(root.style, {',
    '        position: "fixed",',
    '        top: "10px",',
    '        left: "10px",',
    '        right: "10px",',
    '        zIndex: "2147483647",',
    '        display: "flex",',
    '        alignItems: "center",',
    '        justifyContent: "space-between",',
    '        pointerEvents: "none",',
    '        fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",',
    '      });',
    '      const button = document.createElement("button");',
    '      button.type = "button";',
    '      button.textContent = "← 换空间";',
    '      button.setAttribute("aria-label", "返回空间选择");',
    '      button.title = "返回空间选择";',
    '      button.setAttribute("data-linx-role", "embedded-auth-back");',
    '      Object.assign(button.style, {',
    '        pointerEvents: "auto",',
    '        height: "30px",',
    '        padding: "0 10px",',
    '        borderRadius: "999px",',
    '        border: "1px solid rgba(24, 24, 27, 0.12)",',
    '        background: "rgba(255, 255, 255, 0.92)",',
    '        color: "#27272a",',
    '        boxShadow: "0 8px 24px rgba(24, 24, 27, 0.12)",',
    '        fontSize: "12px",',
    '        lineHeight: "30px",',
    '        cursor: "pointer",',
    '      });',
    '      button.addEventListener("click", (event) => {',
    '        event.preventDefault();',
    '        event.stopPropagation();',
    '        window.close();',
    '      });',
    '      const badge = document.createElement("span");',
    '      badge.setAttribute("data-linx-role", "embedded-auth-space");',
    '      Object.assign(badge.style, {',
    '        pointerEvents: "none",',
    '        minWidth: "0",',
    '        maxWidth: "180px",',
    '        height: "30px",',
    '        padding: "0 10px",',
    '        borderRadius: "999px",',
    '        border: "1px solid rgba(24, 24, 27, 0.10)",',
    '        background: "rgba(255, 255, 255, 0.86)",',
    '        color: "#52525b",',
    '        boxShadow: "0 8px 24px rgba(24, 24, 27, 0.08)",',
    '        fontSize: "12px",',
    '        lineHeight: "30px",',
    '        overflow: "hidden",',
    '        textOverflow: "ellipsis",',
    '        whiteSpace: "nowrap",',
    '      });',
    '      root.append(button, badge);',
    '      host.appendChild(root);',
    '    }',
    '    const badge = root.querySelector(\'[data-linx-role="embedded-auth-space"]\');',
    '    if (badge instanceof HTMLElement) {',
    '      if (providerLabel) {',
    '        badge.textContent = `空间：${providerLabel}`;',
    '        badge.style.display = "inline-block";',
    '      } else {',
    '        badge.textContent = "";',
    '        badge.style.display = "none";',
    '      }',
    '    }',
    '    return "installed";',
    '  };',
    '  if (document.readyState === "loading") {',
    '    document.addEventListener("DOMContentLoaded", install, { once: true });',
    '    return "scheduled";',
    '  }',
    '  return install();',
    '})();',
  ].join('\n');
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
