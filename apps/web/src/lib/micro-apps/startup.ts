/**
 * S7 启动时打开: where LinX opens on launch.
 * - `last`: the micro app that was open when LinX closed (remembered here);
 * - `chat`: always the chat.
 * Kept on this device (localStorage).
 */
export type StartupView = 'last' | 'chat'

const VIEW_KEY = 'linx-startup-view'
const LAST_APP_KEY = 'linx-last-micro-app'

export function readStartupView(): StartupView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'chat' ? 'chat' : 'last'
  } catch {
    return 'last'
  }
}

export function writeStartupView(view: StartupView) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Not remembered; the choice lasts until reload.
  }
}

export function rememberLastMicroApp(id: string) {
  try {
    localStorage.setItem(LAST_APP_KEY, id)
  } catch {
    // Ignore: opening on the chat is the fallback.
  }
}

/** The micro app to open at launch, or null for the default (chat). */
export function resolveStartupMicroAppId(isValid: (id: string) => boolean): string | null {
  if (readStartupView() !== 'last') return null
  try {
    const id = localStorage.getItem(LAST_APP_KEY)
    return id && isValid(id) ? id : null
  } catch {
    return null
  }
}
