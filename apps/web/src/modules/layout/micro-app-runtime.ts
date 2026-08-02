import type { SolidDatabase } from '@undefineds.co/models'
import type { MicroAppId } from './micro-app-registry'

export type MicroAppRuntimeRelease = () => void | Promise<void>

export interface MicroAppRuntimeContext {
  db: SolidDatabase
  signal: AbortSignal
}

export interface MicroAppRuntime {
  activate(context: MicroAppRuntimeContext): Promise<MicroAppRuntimeRelease>
}

export type MicroAppRuntimeRegistry = Partial<Record<MicroAppId, MicroAppRuntime>>

export interface MicroAppRuntimeCoordinator {
  activate(microAppId: MicroAppId, db: SolidDatabase): Promise<void>
  deactivate(): Promise<void>
}

interface ActiveRuntime {
  microAppId: MicroAppId
  db: SolidDatabase
  controller: AbortController
  release?: MicroAppRuntimeRelease
}

export function createMicroAppRuntimeCoordinator(
  registry: MicroAppRuntimeRegistry,
): MicroAppRuntimeCoordinator {
  let active: ActiveRuntime | undefined

  const deactivate = async (): Promise<void> => {
    const previous = active
    if (!previous) return
    active = undefined
    previous.controller.abort()
    await previous.release?.()
  }

  return {
    async activate(microAppId, db) {
      if (active?.microAppId === microAppId && active.db === db) return
      await deactivate()

      const runtime = registry[microAppId]
      if (!runtime) return

      const activation: ActiveRuntime = {
        microAppId,
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
