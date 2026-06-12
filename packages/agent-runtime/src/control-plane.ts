export type LinxSessionControlSurface = 'cli' | 'app' | 'desktop' | 'runtime'

export interface LinxSessionControlState {
  autoEnabled?: boolean
  symphonyEnabled?: boolean
  updatedAt: string
  updatedBy?: LinxSessionControlSurface | string
}

export interface LinxSessionControlMetadata {
  controlPlane: {
    linxSession: LinxSessionControlState
  }
}

export function buildLinxSessionControlState(input: {
  autoEnabled?: boolean
  symphonyEnabled?: boolean
  updatedAt?: Date | string
  updatedBy?: LinxSessionControlSurface | string
}): LinxSessionControlState {
  return {
    ...(input.autoEnabled !== undefined ? { autoEnabled: input.autoEnabled } : {}),
    ...(input.symphonyEnabled !== undefined ? { symphonyEnabled: input.symphonyEnabled } : {}),
    updatedAt: toControlStateIsoString(input.updatedAt ?? new Date()),
    ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
  }
}

export function buildLinxSessionControlMetadata(input: {
  autoEnabled?: boolean
  symphonyEnabled?: boolean
  updatedAt?: Date | string
  updatedBy?: LinxSessionControlSurface | string
}): LinxSessionControlMetadata {
  return {
    controlPlane: {
      linxSession: buildLinxSessionControlState(input),
    },
  }
}

export function mergeLinxSessionControlMetadata(
  metadata: Record<string, unknown> | null | undefined,
  state: LinxSessionControlState,
): Record<string, unknown> {
  const existing = isRecord(metadata) ? metadata : {}
  const existingControlPlane = isRecord(existing.controlPlane) ? existing.controlPlane : {}
  const existingSession = isRecord(existingControlPlane.linxSession) ? existingControlPlane.linxSession : {}

  return {
    ...existing,
    controlPlane: {
      ...existingControlPlane,
      linxSession: {
        ...existingSession,
        ...state,
      },
    },
  }
}

export function readLinxSessionControlMetadata(
  metadata: Record<string, unknown> | null | undefined,
): LinxSessionControlState | null {
  if (!isRecord(metadata)) {
    return null
  }

  const controlPlane = isRecord(metadata.controlPlane) ? metadata.controlPlane : null
  const session = controlPlane && isRecord(controlPlane.linxSession) ? controlPlane.linxSession : null
  if (!session) {
    return null
  }

  const updatedAt = typeof session.updatedAt === 'string'
    ? session.updatedAt
    : undefined
  const autoEnabled = typeof session.autoEnabled === 'boolean'
    ? session.autoEnabled
    : undefined
  const symphonyEnabled = typeof session.symphonyEnabled === 'boolean'
    ? session.symphonyEnabled
    : undefined
  const updatedBy = typeof session.updatedBy === 'string'
    ? session.updatedBy
    : undefined

  if (autoEnabled === undefined && symphonyEnabled === undefined && !updatedAt && !updatedBy) {
    return null
  }

  return {
    ...(autoEnabled !== undefined ? { autoEnabled } : {}),
    ...(symphonyEnabled !== undefined ? { symphonyEnabled } : {}),
    updatedAt: updatedAt ? toControlStateIsoString(updatedAt) : new Date(0).toISOString(),
    ...(updatedBy ? { updatedBy } : {}),
  }
}

export function resolveLinxSessionAutoEnabled(
  metadata: Record<string, unknown> | null | undefined,
): boolean | null {
  const state = readLinxSessionControlMetadata(metadata)
  return typeof state?.autoEnabled === 'boolean' ? state.autoEnabled : null
}

export function resolveLinxSessionSymphonyEnabled(
  metadata: Record<string, unknown> | null | undefined,
): boolean | null {
  const state = readLinxSessionControlMetadata(metadata)
  return typeof state?.symphonyEnabled === 'boolean' ? state.symphonyEnabled : null
}

function toControlStateIsoString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
