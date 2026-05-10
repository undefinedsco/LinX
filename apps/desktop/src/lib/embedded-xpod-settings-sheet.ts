import { BrowserView, type BrowserWindow, type Rectangle } from 'electron';
import { installSingleSurfaceWindowOpenHandler } from './window-open-routing';

export interface EmbeddedXpodSettingsState {
  open: boolean;
  reason: 'opened' | 'closed';
  ready: boolean;
}

interface EmbeddedXpodSettingsSheetOptions {
  getMainWindow: () => BrowserWindow | null;
  onStateChange?: (state: EmbeddedXpodSettingsState) => void;
}

export class EmbeddedXpodSettingsSheet {
  private readonly getMainWindow: () => BrowserWindow | null;
  private readonly onStateChange?: (state: EmbeddedXpodSettingsState) => void;
  private view: BrowserView | null = null;
  private attachedWindow: BrowserWindow | null = null;
  private isOpen = false;
  private openToken = 0;
  private state: EmbeddedXpodSettingsState = {
    open: false,
    reason: 'closed',
    ready: false,
  };

  public constructor(options: EmbeddedXpodSettingsSheetOptions) {
    this.getMainWindow = options.getMainWindow;
    this.onStateChange = options.onStateChange;
  }

  public async open(url: string): Promise<void> {
    const mainWindow = this.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Main window is not ready.');
    }

    const openToken = ++this.openToken;
    const view = this.ensureView();
    this.emitState({ open: true, reason: 'opened', ready: false });

    try {
      await loadURLWithRetry(view.webContents, url, 10);
      if (!this.isRequestCurrent(openToken)) {
        return;
      }

      this.attach(mainWindow);
      this.fitToWindow();
      if (!this.isRequestCurrent(openToken)) {
        return;
      }

      this.emitState({ open: true, reason: 'opened', ready: true });
      view.webContents.focus();
    } catch (error) {
      if (this.isRequestCurrent(openToken)) {
        this.detach();
        this.emitState({ open: false, reason: 'closed', ready: false });
      }

      throw error;
    }
  }

  public close(): void {
    this.openToken += 1;
    this.detach();
    this.emitState({ open: false, reason: 'closed', ready: false });
  }

  public getState(): EmbeddedXpodSettingsState {
    return { ...this.state };
  }

  public dispose(): void {
    this.openToken += 1;
    this.detach();
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.close({ waitForBeforeUnload: false });
    }
    this.view = null;
  }

  public getWebContents(): Electron.WebContents | null {
    return this.view?.webContents ?? null;
  }

  private ensureView(): BrowserView {
    if (this.view && !this.view.webContents.isDestroyed()) {
      return this.view;
    }

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    installSingleSurfaceWindowOpenHandler(view.webContents);

    view.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });

    view.webContents.on('did-finish-load', () => {
      this.fitToWindow();
    });

    view.webContents.on('did-navigate-in-page', () => {
      this.fitToWindow();
    });

    this.view = view;
    return view;
  }

  private attach(mainWindow: BrowserWindow): void {
    const view = this.ensureView();

    if (this.attachedWindow && this.attachedWindow !== mainWindow && !this.attachedWindow.isDestroyed()) {
      this.attachedWindow.removeBrowserView(view);
      this.attachedWindow.removeListener('resize', this.handleResize);
      this.attachedWindow.removeListener('closed', this.handleWindowClosed);
      this.attachedWindow = null;
    }

    if (this.attachedWindow === mainWindow) {
      mainWindow.setTopBrowserView(view);
      return;
    }

    mainWindow.addBrowserView(view);
    mainWindow.setTopBrowserView(view);
    mainWindow.on('resize', this.handleResize);
    mainWindow.on('closed', this.handleWindowClosed);
    this.attachedWindow = mainWindow;
  }

  private detach(): void {
    const view = this.view;
    const mainWindow = this.attachedWindow;
    if (!view || !mainWindow) {
      this.attachedWindow = null;
      return;
    }

    if (!mainWindow.isDestroyed()) {
      mainWindow.removeListener('resize', this.handleResize);
      mainWindow.removeListener('closed', this.handleWindowClosed);
      try {
        mainWindow.removeBrowserView(view);
      } catch {
        // ignore detach errors during shutdown
      }

      try {
        mainWindow.webContents.focus();
        mainWindow.focus();
      } catch {
        // ignore focus errors during teardown
      }
    }

    this.attachedWindow = null;
  }

  private readonly handleResize = () => {
    this.fitToWindow();
  };

  private readonly handleWindowClosed = () => {
    this.attachedWindow = null;
    this.emitState({ open: false, reason: 'closed', ready: false });
  };

  private fitToWindow(): void {
    const mainWindow = this.attachedWindow;
    const view = this.view;
    if (!mainWindow || mainWindow.isDestroyed() || !view || view.webContents.isDestroyed()) {
      return;
    }

    view.setBounds(getEmbeddedXpodSettingsBounds(mainWindow.getContentBounds()));
    mainWindow.setTopBrowserView(view);
  }

  private emitState(state: EmbeddedXpodSettingsState): void {
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
}

export function getEmbeddedXpodSettingsBounds(
  parentBounds: Pick<Rectangle, 'width' | 'height'>,
): Rectangle {
  const width = Math.max(420, Math.min(1120, parentBounds.width - 48));
  const height = Math.max(520, Math.min(800, parentBounds.height - 48));
  const x = Math.max(24, Math.floor((parentBounds.width - width) / 2));
  const y = Math.max(24, Math.floor((parentBounds.height - height) / 2));

  return { x, y, width, height };
}

async function loadURLWithRetry(
  target: Pick<Electron.WebContents, 'loadURL'>,
  url: string,
  retries = 30,
): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await target.loadURL(url);
      return;
    } catch (error: any) {
      if (error?.code !== 'ERR_CONNECTION_REFUSED' || attempt === retries - 1) {
        throw error;
      }

      await wait(1000);
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
