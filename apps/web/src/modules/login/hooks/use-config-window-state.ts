import { useEffect, useState } from 'react'

interface ConfigWindowState {
  open: boolean
  ready: boolean
}

const DEFAULT_STATE: ConfigWindowState = {
  open: false,
  ready: false,
}

export function useConfigWindowState() {
  const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
  const [state, setState] = useState<ConfigWindowState>(DEFAULT_STATE)

  useEffect(() => {
    if (!desktopApi?.app?.onConfigWindowState) {
      setState(DEFAULT_STATE)
      return
    }

    let active = true

    void desktopApi.app.getConfigWindowState?.()
      .then((next) => {
        if (active && next) {
          setState({
            open: Boolean(next.open),
            ready: Boolean(next.ready),
          })
        }
      })
      .catch(() => {})

    const unsubscribe = desktopApi.app.onConfigWindowState((next) => {
      setState({
        open: next.open,
        ready: Boolean(next.ready),
      })
    })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [desktopApi])

  const close = async () => {
    if (!desktopApi?.app?.closeConfigWindow) return
    await desktopApi.app.closeConfigWindow()
  }

  return {
    ...state,
    close,
  }
}
