import { useEffect, useState } from 'react'

interface EmbeddedAuthorizationState {
  open: boolean
  reason: 'opened' | 'completed' | 'dismissed'
  ready: boolean
}

const DEFAULT_STATE: EmbeddedAuthorizationState = {
  open: false,
  reason: 'dismissed',
  ready: false,
}

export function useEmbeddedAuthorizationState() {
  const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
  const [state, setState] = useState<EmbeddedAuthorizationState>(DEFAULT_STATE)

  useEffect(() => {
    if (!desktopApi?.auth?.onEmbeddedAuthorizationState) {
      setState(DEFAULT_STATE)
      return
    }

    let active = true

    void desktopApi.auth.getEmbeddedAuthorizationState?.()
      .then((next) => {
        if (active && next) {
          setState(next)
        }
      })
      .catch(() => {})

    const unsubscribe = desktopApi.auth.onEmbeddedAuthorizationState((next) => {
      setState(next)
    })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [desktopApi])

  const close = async () => {
    if (!desktopApi?.auth?.closeEmbeddedAuthorization) {
      return
    }

    await desktopApi.auth.closeEmbeddedAuthorization()
  }

  return {
    ...state,
    close,
  }
}
