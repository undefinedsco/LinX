import { shell } from 'electron'
import { addEmbeddedAuthQuery } from './xpod-auth-enhancer'

type WindowOpenHandlerTarget = Pick<Electron.WebContents, 'getURL' | 'loadURL' | 'setWindowOpenHandler'>

interface WindowOpenRoutingOptions {
  prepareSameOriginUrl?: (url: string) => string
}

export function installSingleSurfaceWindowOpenHandler(
  webContents: WindowOpenHandlerTarget,
  options: WindowOpenRoutingOptions = {},
): void {
  if (typeof webContents.setWindowOpenHandler !== 'function') {
    return
  }

  webContents.setWindowOpenHandler(({ url }) => {
    void routeWindowOpenRequest(webContents, url, options)
    return { action: 'deny' }
  })
}

export async function routeWindowOpenRequest(
  webContents: Pick<Electron.WebContents, 'getURL' | 'loadURL'>,
  targetUrl: string,
  options: WindowOpenRoutingOptions = {},
): Promise<void> {
  const currentUrl = webContents.getURL()
  const nextUrl = resolveNavigationTarget(currentUrl, targetUrl)
  if (!nextUrl) {
    return
  }

  if (shouldStayInCurrentSurface(currentUrl, nextUrl)) {
    await webContents.loadURL(options.prepareSameOriginUrl?.(nextUrl) ?? nextUrl)
    return
  }

  await shell.openExternal(nextUrl)
}

function resolveNavigationTarget(currentUrl: string, targetUrl: string): string | null {
  if (!targetUrl || targetUrl === 'about:blank') {
    return null
  }

  try {
    return new URL(targetUrl, currentUrl || 'http://localhost/').toString()
  } catch {
    return null
  }
}

function shouldStayInCurrentSurface(currentUrl: string, targetUrl: string): boolean {
  try {
    const current = new URL(currentUrl)
    const next = new URL(targetUrl)
    return current.origin === next.origin
  } catch {
    return false
  }
}
