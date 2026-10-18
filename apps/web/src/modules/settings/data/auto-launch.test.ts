import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAutoLaunchAvailable, readAutoLaunch, writeAutoLaunch } from './auto-launch'

function installDesktopBridge(initial: boolean) {
  let enabled = initial
  const app = {
    getAutoLaunch: vi.fn(async () => ({ enabled })),
    setAutoLaunch: vi.fn(async (next: boolean) => { enabled = next; return { enabled } }),
  }
  Object.defineProperty(window, 'xpodDesktop', { configurable: true, value: { app } })
  return app
}

describe('开机自动打开 bridge', () => {
  afterEach(() => {
    delete (window as unknown as { xpodDesktop?: unknown }).xpodDesktop
  })

  it('is unavailable on the web, so the row stays hidden', async () => {
    expect(isAutoLaunchAvailable()).toBe(false)
    expect(await readAutoLaunch()).toBeNull()
    expect(await writeAutoLaunch(true)).toBeNull()
  })

  it('reads and writes the desktop login-item setting', async () => {
    const app = installDesktopBridge(false)
    expect(isAutoLaunchAvailable()).toBe(true)
    expect(await readAutoLaunch()).toBe(false)
    expect(await writeAutoLaunch(true)).toBe(true)
    expect(app.setAutoLaunch).toHaveBeenCalledWith(true)
    expect(await readAutoLaunch()).toBe(true)
  })
})
