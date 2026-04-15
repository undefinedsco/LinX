/**
 * System Tray Module - Provides system tray icon and menu
 */
import { app, Tray, Menu, nativeImage, shell } from 'electron'
import * as path from 'path'
import { getXpodModule } from './xpod'
import { getWebServerModule } from './web-server'
import { getPodMountModule } from './mount/module'

export class TrayModule {
  private tray: Tray | null = null

  /**
   * Create the system tray
   */
  create(): void {
    if (this.tray) {
      return
    }

    // Create tray icon
    const iconPath = this.getIconPath()
    const icon = nativeImage.createFromPath(iconPath)
    this.tray = new Tray(icon.resize({ width: 16, height: 16 }))

    this.tray.setToolTip('LinX')
    this.updateMenu()

    console.log('[Tray] Created system tray')
  }

  /**
   * Get tray icon path
   */
  private getIconPath(): string {
    // Use a simple icon - in production would be a proper icon file
    const iconName = process.platform === 'win32' ? 'icon.ico' : 'iconTemplate.png'

    // Development path
    const devIcon = path.join(__dirname, '..', '..', 'assets', iconName)

    // Packaged path
    const resourcesPath = (process as any).resourcesPath
    if (resourcesPath) {
      return path.join(resourcesPath, 'assets', iconName)
    }

    return devIcon
  }

  /**
   * Update the tray menu
   */
  updateMenu(): void {
    if (!this.tray) {
      return
    }

    const xpodStatus = getXpodModule().getStatus()
    const webUrl = getWebServerModule().getUrl()

    const statusLabel = xpodStatus.running ? '● 运行中' : '○ 已停止'

    const menu = Menu.buildFromTemplate([
      {
        label: '打开 LinX',
        click: () => {
          shell.openExternal(webUrl)
        },
      },
      { type: 'separator' },
      {
        label: `Pod 状态: ${statusLabel}`,
        enabled: false,
      },
      {
        label: `  本地: ${xpodStatus.baseUrl || 'http://localhost:5737'}`,
        enabled: false,
      },
      ...(xpodStatus.publicUrl
        ? [
            {
              label: `  公网: ${xpodStatus.publicUrl}`,
              enabled: false,
            } as Electron.MenuItemConstructorOptions,
          ]
        : []),
      {
        label: '打开 xpod App',
        click: () => {
          const target = `${(xpodStatus.publicUrl || xpodStatus.baseUrl || 'http://localhost:5737').replace(/\/$/, '')}/app/`
          shell.openExternal(target)
        },
      },
      {
        label: '打开 xpod Dashboard',
        click: () => {
          const target = `${(xpodStatus.publicUrl || xpodStatus.baseUrl || 'http://localhost:5737').replace(/\/$/, '')}/dashboard/`
          shell.openExternal(target)
        },
      },
      {
        label: '打开当前 Pod 挂载点',
        click: async () => {
          try {
            await getPodMountModule().revealCurrent()
          } catch (error) {
            console.error('[Tray] Failed to reveal current mount:', error)
          }
        },
      },
      { type: 'separator' },
      {
        label: '网络接入',
        submenu: [
          {
            label: xpodStatus.publicUrl
              ? `✓ ${xpodStatus.publicUrl}`
              : '✗ 仅本地访问',
            enabled: false,
          },
          {
            label: '配置网络...',
            click: () => {
              shell.openExternal(`${webUrl}/settings/network`)
            },
          },
        ],
      },
      { type: 'separator' },
      {
        label: '开机启动',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (menuItem) => {
          this.setAutoLaunch(menuItem.checked)
        },
      },
      {
        label: '设置...',
        click: () => {
          shell.openExternal(`${webUrl}/settings`)
        },
      },
      { type: 'separator' },
      {
        label: '重启服务',
        click: async () => {
          await getXpodModule().restart()
          this.updateMenu()
        },
      },
      {
        label: '退出 LinX',
        click: () => {
          app.quit()
        },
      },
    ])

    this.tray.setContextMenu(menu)
  }

  /**
   * Set auto launch on login
   */
  private setAutoLaunch(enabled: boolean): void {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
    })
    console.log('[Tray] Auto launch:', enabled)
  }

  /**
   * Destroy the tray
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}

// Singleton
let instance: TrayModule | null = null

export function getTrayModule(): TrayModule {
  if (!instance) {
    instance = new TrayModule()
  }
  return instance
}
