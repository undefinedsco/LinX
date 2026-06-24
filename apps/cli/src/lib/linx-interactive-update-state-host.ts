export type LinxInteractiveUpdateState = {
  updateInProgress: boolean
  updateCheckScheduled: boolean
  deferredUpdateVersion: unknown
  suppressUpstreamPiUpdate: boolean
}

const LINX_UPDATE_IN_PROGRESS = Symbol.for('linx.tui.updateInProgress')
const LINX_UPDATE_CHECK_SCHEDULED = Symbol.for('linx.tui.updateCheckScheduled')
const LINX_DEFERRED_UPDATE_VERSION = Symbol.for('linx.tui.deferredUpdateVersion')
const LINX_SUPPRESS_UPSTREAM_PI_UPDATE = Symbol.for('linx.tui.suppressUpstreamPiUpdate')

type UpdateStateTarget = Record<symbol, unknown>

export function getLinxInteractiveUpdateState(interactive: any): LinxInteractiveUpdateState {
  const target = isUpdateStateTarget(interactive) ? interactive : undefined

  return {
    get updateInProgress() {
      return Boolean(target?.[LINX_UPDATE_IN_PROGRESS])
    },
    set updateInProgress(value: boolean) {
      setUpdateStateValue(target, LINX_UPDATE_IN_PROGRESS, value)
    },
    get updateCheckScheduled() {
      return Boolean(target?.[LINX_UPDATE_CHECK_SCHEDULED])
    },
    set updateCheckScheduled(value: boolean) {
      setUpdateStateValue(target, LINX_UPDATE_CHECK_SCHEDULED, value)
    },
    get deferredUpdateVersion() {
      return target?.[LINX_DEFERRED_UPDATE_VERSION]
    },
    set deferredUpdateVersion(value: unknown) {
      setUpdateStateValue(target, LINX_DEFERRED_UPDATE_VERSION, value)
    },
    get suppressUpstreamPiUpdate() {
      return Boolean(target?.[LINX_SUPPRESS_UPSTREAM_PI_UPDATE])
    },
    set suppressUpstreamPiUpdate(value: boolean) {
      setUpdateStateValue(target, LINX_SUPPRESS_UPSTREAM_PI_UPDATE, value)
    },
  }
}

function isUpdateStateTarget(value: unknown): value is UpdateStateTarget {
  return Boolean(value && (typeof value === 'object' || typeof value === 'function'))
}

function setUpdateStateValue(target: UpdateStateTarget | undefined, key: symbol, value: unknown): void {
  if (!target) {
    return
  }
  target[key] = value
}
