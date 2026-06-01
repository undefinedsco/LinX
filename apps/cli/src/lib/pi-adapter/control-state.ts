import {
  resolveLinxSessionAutoEnabled,
  resolveLinxSessionSymphonyEnabled,
} from '@linx/agent-runtime/control-plane'
import { createLinxPodSyncScope, type LinxSyncRunResult } from '@linx/agent-runtime/sync'
import {
  buildSessionResourceId,
  buildSessionSubjectPath,
  sessionResource,
  type SessionRow,
  type SolidDatabase,
} from '../models.js'

export interface LinxPiControlState {
  autoEnabled?: boolean
  symphonyEnabled?: boolean
}

export interface LinxPiControlStateHydration {
  state: LinxPiControlState | null
  result: LinxSyncRunResult
}

export function deriveLinxPiStartupControlState(input: {
  requestedAuto?: boolean
  hydration: LinxPiControlStateHydration | null
  restoreAutoFromHydration?: boolean
}): { autoEnabled: boolean; symphonyEnabled: boolean } {
  if (input.requestedAuto !== undefined) {
    return {
      autoEnabled: input.requestedAuto,
      symphonyEnabled: input.hydration?.state?.symphonyEnabled === true,
    }
  }

  return {
    autoEnabled: input.restoreAutoFromHydration === true && input.hydration?.state?.autoEnabled === true,
    symphonyEnabled: input.hydration?.state?.symphonyEnabled === true,
  }
}

export async function hydrateLinxPiControlState(options: {
  db: SolidDatabase
  sessionId: string
  createdAt: Date | string | number
  onError?: (error: unknown) => void
}): Promise<LinxPiControlStateHydration | null> {
  let state: LinxPiControlState | null = null
  const sessionUri = resolveSessionIri(options.db, options.sessionId, options.createdAt)
  const sync = createLinxPodSyncScope({
    source: 'pod',
    target: 'pi-runtime',
    direction: 'core-to-local',
    plane: 'control-plane',
    authority: 'core',
    onOperationError(_operation, error) {
      options.onError?.(error)
    },
  })

  try {
    await sync.run({
      action: 'session.control.hydrate',
      operationId: `pi-control-state:${options.sessionId}:read`,
      kind: 'upsert',
      subject: options.sessionId,
      resourceBindings: {
        session: { uri: sessionUri, local: options.sessionId },
      },
      task: async () => {
        const row = await readSessionRow(options.db, options.sessionId, options.createdAt)
        const autoEnabled = resolveLinxSessionAutoEnabled(row?.metadata)
        const symphonyEnabled = resolveLinxSessionSymphonyEnabled(row?.metadata)
        state = autoEnabled === null && symphonyEnabled === null
          ? null
          : {
            ...(autoEnabled !== null ? { autoEnabled } : {}),
            ...(symphonyEnabled !== null ? { symphonyEnabled } : {}),
          }
      },
    })
  } catch {
    return null
  }

  const result = sync.getLastResult()
  return result ? { state, result } : null
}

function resolveSessionIri(
  db: SolidDatabase,
  sessionId: string,
  createdAt: Date | string | number,
): string {
  if (typeof db.resolveLocatorIri === 'function') {
    return db.resolveLocatorIri(sessionResource, { id: sessionId, createdAt })
  }

  const sessionLike = (db as unknown as { session?: { info?: { webId?: unknown } } }).session
  const webId = typeof sessionLike?.info?.webId === 'string'
    ? sessionLike.info.webId
    : null
  if (webId) {
    return `${webId.replace('/profile/card#me', '').replace(/\/$/, '')}${buildSessionSubjectPath(sessionId, createdAt)}`
  }

  return buildSessionSubjectPath(sessionId, createdAt)
}

async function readSessionRow(
  db: SolidDatabase,
  sessionId: string,
  createdAt: Date | string | number,
): Promise<SessionRow | null> {
  const resourceId = buildSessionResourceId(sessionId, createdAt)
  const byId = await db.findById(sessionResource, resourceId) as SessionRow | null
  if (byId) {
    return byId
  }

  const iri = db.resolveLocatorIri(sessionResource, { id: sessionId, createdAt })
  return await db.findByIri(sessionResource, iri) as SessionRow | null
}
