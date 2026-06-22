import { listArchivedAutoModeSessions, loadArchivedAutoModeEvents, runAutoMode } from '../auto-mode/runner.js'
import type { AutoRunOptions } from '../auto-mode/types.js'
import {
  listOpenSymphonyIssuesFromPod,
  mirrorSymphonyProjectionJsonLdFromPod,
  persistSymphonyControlStateToPod,
  persistSymphonyProjectionToPod,
  type SymphonyPodProjectionRuntime,
} from './pod-projection.js'

export interface SymphonyRuntime {
  runAutoMode(options: AutoRunOptions): Promise<number>
  listAutoModeSessions(): ReturnType<typeof listArchivedAutoModeSessions>
  loadAutoModeEvents?: typeof loadArchivedAutoModeEvents
  persistSymphonyControlStateToPod?: typeof persistSymphonyControlStateToPod
  /** @deprecated Use persistSymphonyControlStateToPod for LinX-owned Symphony records. */
  persistSymphonyProjectionToPod?: typeof persistSymphonyProjectionToPod
  listOpenSymphonyIssuesFromPod?: typeof listOpenSymphonyIssuesFromPod
  mirrorSymphonyProjectionJsonLdFromPod?: typeof mirrorSymphonyProjectionJsonLdFromPod
}

export const defaultSymphonyRuntime: SymphonyRuntime = {
  runAutoMode,
  listAutoModeSessions: listArchivedAutoModeSessions,
  loadAutoModeEvents: loadArchivedAutoModeEvents,
  persistSymphonyControlStateToPod,
  listOpenSymphonyIssuesFromPod,
  mirrorSymphonyProjectionJsonLdFromPod,
}


export function createSymphonyRuntimeForPodProjection(
  projectionRuntime: SymphonyPodProjectionRuntime,
): SymphonyRuntime {
  return {
    runAutoMode,
    listAutoModeSessions: listArchivedAutoModeSessions,
    loadAutoModeEvents: loadArchivedAutoModeEvents,
    persistSymphonyControlStateToPod(plan, options) {
      return persistSymphonyControlStateToPod(plan, {
        ...options,
        runtime: projectionRuntime,
      })
    },
    listOpenSymphonyIssuesFromPod() {
      return listOpenSymphonyIssuesFromPod({ runtime: projectionRuntime })
    },
    mirrorSymphonyProjectionJsonLdFromPod(result) {
      return mirrorSymphonyProjectionJsonLdFromPod(result, { runtime: projectionRuntime })
    },
  }
}
