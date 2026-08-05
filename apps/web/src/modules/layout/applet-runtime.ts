import type { SolidDatabase } from '@undefineds.co/models'
import type { AppletId } from './applet-registry'

export type AppletRuntimeRelease = () => void | Promise<void>

export interface AppletRuntimeContext {
  db: SolidDatabase
  signal: AbortSignal
}

export interface AppletRuntime {
  activate(context: AppletRuntimeContext): Promise<AppletRuntimeRelease>
}

export type AppletRuntimeRegistry = Partial<Record<AppletId, AppletRuntime>>

export interface AppletRuntimeCoordinator {
  activate(appletId: AppletId, db: SolidDatabase): Promise<void>
  deactivate(): Promise<void>
}

interface ActiveRuntime {
  appletId: AppletId
  db: SolidDatabase
  controller: AbortController
  release?: AppletRuntimeRelease
}

export function createAppletRuntimeCoordinator(
  registry: AppletRuntimeRegistry,
): AppletRuntimeCoordinator {
  let active: ActiveRuntime | undefined

  const deactivate = async (): Promise<void> => {
    const previous = active
    if (!previous) return
    active = undefined
    previous.controller.abort()
    await previous.release?.()
  }

  return {
    async activate(appletId, db) {
      if (active?.appletId === appletId && active.db === db) return
      await deactivate()

      const runtime = registry[appletId]
      if (!runtime) return

      const activation: ActiveRuntime = {
        appletId,
        db,
        controller: new AbortController(),
      }
      active = activation
      const release = await runtime.activate({
        db,
        signal: activation.controller.signal,
      })

      if (active !== activation || activation.controller.signal.aborted) {
        await release()
        return
      }
      activation.release = release
    },

    deactivate,
  }
}
