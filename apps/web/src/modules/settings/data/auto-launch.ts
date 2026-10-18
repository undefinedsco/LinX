/** The desktop shell's login-item bridge (apps/desktop preload `app.getAutoLaunch / setAutoLaunch`). */
interface AutoLaunchBridge {
  getAutoLaunch: () => Promise<{ enabled: boolean }>
  setAutoLaunch: (enabled: boolean) => Promise<{ enabled: boolean }>
}

function bridge(): AutoLaunchBridge | null {
  if (typeof window === 'undefined') return null
  const app = (window as unknown as { xpodDesktop?: { app?: Partial<AutoLaunchBridge> } }).xpodDesktop?.app
  return app?.getAutoLaunch && app.setAutoLaunch ? (app as AutoLaunchBridge) : null
}

/** False on the web: the 开机自动打开 row is hidden. */
export function isAutoLaunchAvailable(): boolean {
  return bridge() !== null
}

export async function readAutoLaunch(): Promise<boolean | null> {
  const api = bridge()
  if (!api) return null
  return (await api.getAutoLaunch()).enabled
}

export async function writeAutoLaunch(enabled: boolean): Promise<boolean | null> {
  const api = bridge()
  if (!api) return null
  return (await api.setAutoLaunch(enabled)).enabled
}
