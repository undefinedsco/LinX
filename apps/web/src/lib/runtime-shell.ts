export type RuntimeShellId = 'web' | 'desktop' | 'mobile'

export interface RuntimeShellInfo {
  id: RuntimeShellId
  label: string
  authLabel: string
  description: string
}

function detectShellId(): RuntimeShellId {
  if (typeof window === 'undefined') {
    return 'web'
  }

  const runtimeWindow = window as Window & {
    xpodDesktop?: unknown
    Capacitor?: {
      isNativePlatform?: () => boolean
      getPlatform?: () => string
    }
  }

  if (runtimeWindow.Capacitor?.isNativePlatform?.()) {
    return 'mobile'
  }

  if (runtimeWindow.xpodDesktop) {
    return 'desktop'
  }

  return 'web'
}

export function getRuntimeShellInfo(): RuntimeShellInfo {
  const id = detectShellId()

  if (id === 'desktop') {
    return {
      id,
      label: 'Desktop',
      authLabel: 'Solid Pod 登录',
      description: 'Electron shell + shared web app',
    }
  }

  if (id === 'mobile') {
    return {
      id,
      label: 'Mobile',
      authLabel: 'Solid Pod 登录',
      description: 'Capacitor shell + shared web app',
    }
  }

  return {
    id,
    label: 'Web',
    authLabel: 'Solid Pod 登录',
    description: 'Browser shell + shared web app',
  }
}
