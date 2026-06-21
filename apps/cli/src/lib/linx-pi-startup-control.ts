import { createLinxPodDataSession } from './linx-pod-data-session-factory.js'
import { deriveLinxPiStartupControlState, hydrateLinxPiControlState } from './linx-startup-control-state.js'
import { drizzle, solidResources, type SolidDatabase } from './models.js'

export interface LinxPiStartupControlSessionManager {
  getSessionId(): string
  getEntries(): Array<{ timestamp?: unknown }>
}

export interface ResolveLinxPiStartupControlStateOptions {
  requestedAuto?: boolean
  hydrateFromPod: boolean
  restoreAutoFromHydration?: boolean
  sessionManager: LinxPiStartupControlSessionManager
}

export interface LinxPiStartupControlState {
  autoEnabled: boolean
  symphonyEnabled: boolean
}

export async function resolveLinxPiStartupControlState(
  options: ResolveLinxPiStartupControlStateOptions,
): Promise<LinxPiStartupControlState> {
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
    const hydration = await hydrateLinxPiControlState({
      db,
      sessionId: options.sessionManager.getSessionId(),
      createdAt: getLinxPiSessionCreatedAt(options.sessionManager),
      onError(error) {
        if (process.env.LINX_DEBUG === '1') {
          const message = error instanceof Error ? error.stack || error.message : String(error)
          process.stderr.write(`[linx control state] ${message}\n`)
        }
      },
    })
    return {
      ...deriveLinxPiStartupControlState({
        requestedAuto: options.requestedAuto,
        hydration,
        restoreAutoFromHydration: options.restoreAutoFromHydration,
      }),
    }
  } finally {
    await session.close().catch(() => undefined)
  }
}

function getLinxPiSessionCreatedAt(sessionManager: LinxPiStartupControlSessionManager): Date {
  const entryDate = sessionManager.getEntries()
    .map((entry) => toDate(entry.timestamp))
    .find((date): date is Date => date instanceof Date)
  return entryDate ?? parseTimestampFromUuidLikeId(sessionManager.getSessionId()) ?? new Date()
}

function parseTimestampFromUuidLikeId(id: string): Date | null {
  const prefix = id.replace(/-/g, '').slice(0, 12)
  if (!/^[\da-f]{12}$/i.test(prefix)) {
    return null
  }
  const millis = Number.parseInt(prefix, 16)
  if (!Number.isFinite(millis) || millis <= 0) {
    return null
  }
  const date = new Date(millis)
  return Number.isNaN(date.getTime()) ? null : date
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}
