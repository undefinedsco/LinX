import { createLinxPodDataSession } from './linx-pod-data-session-factory.js'
import { deriveLinxStartupControlState, hydrateLinxControlState } from './linx-startup-control-state.js'
import { drizzle, solidResources, type SolidDatabase } from './models.js'

export interface LinxStartupArchiveIdentity {
  sessionId: string
  createdAt: Date
}

export interface ResolveLinxStartupControlStateOptions {
  requestedAuto?: boolean
  hydrateFromPod: boolean
  restoreAutoFromHydration?: boolean
  archive: LinxStartupArchiveIdentity
}

export interface LinxStartupControlState {
  autoEnabled: boolean
  symphonyEnabled: boolean
}

export async function resolveLinxStartupControlState(
  options: ResolveLinxStartupControlStateOptions,
): Promise<LinxStartupControlState> {
  if (!options.hydrateFromPod) {
    return {
      autoEnabled: options.requestedAuto === true,
      symphonyEnabled: false,
    }
  }

  const session = await createLinxPodDataSession().catch(() => null)
  if (!session) {
    return {
      autoEnabled: options.requestedAuto === true,
      symphonyEnabled: false,
    }
  }

  try {
    const db = drizzle(session.solidSession, {
      logger: false,
      disableInteropDiscovery: true,
      podUrl: session.podUrl,
      resourcePreparation: 'off' as never,
      schema: solidResources,
    }) as unknown as SolidDatabase
    const hydration = await hydrateLinxControlState({
      db,
      sessionId: options.archive.sessionId,
      createdAt: options.archive.createdAt,
      onError(error) {
        if (process.env.LINX_DEBUG === '1') {
          const message = error instanceof Error ? error.stack || error.message : String(error)
          process.stderr.write(`[linx control state] ${message}\n`)
        }
      },
    })
    return {
      ...deriveLinxStartupControlState({
        requestedAuto: options.requestedAuto,
        hydration,
        restoreAutoFromHydration: options.restoreAutoFromHydration,
      }),
    }
  } finally {
    await session.close().catch(() => undefined)
  }
}
