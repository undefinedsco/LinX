import type { StructuredCellWriteProposal } from '../../domain/structured/structured-table'

/**
 * R6 K6d: what the person sees after editing a cell: 保存中… / 已保存 / 没保存成功 重试.
 * Several edits can be in flight; the line says 保存中 until the last one is done, and a failure
 * keeps the proposal so 重试 can send it again.
 */
export interface StructuredSaveState {
  inFlight: number
  status: 'idle' | 'saving' | 'saved' | 'error'
  failedProposal: StructuredCellWriteProposal | null
}

export function createStructuredSaveState(): StructuredSaveState {
  return { inFlight: 0, status: 'idle', failedProposal: null }
}

export function projectStructuredSaveStarted(current: StructuredSaveState): StructuredSaveState {
  return { inFlight: current.inFlight + 1, status: 'saving', failedProposal: null }
}

export function projectStructuredSaveFinished(current: StructuredSaveState): StructuredSaveState {
  const inFlight = Math.max(0, current.inFlight - 1)
  if (current.status === 'error') return { ...current, inFlight }
  return { inFlight, status: inFlight > 0 ? 'saving' : 'saved', failedProposal: null }
}

export function projectStructuredSaveFailed(
  current: StructuredSaveState,
  proposal: StructuredCellWriteProposal,
): StructuredSaveState {
  return { inFlight: Math.max(0, current.inFlight - 1), status: 'error', failedProposal: proposal }
}

/** The "已保存" line goes away on its own. */
export function projectStructuredSaveSettled(current: StructuredSaveState): StructuredSaveState {
  return current.status === 'saved' ? { ...current, status: 'idle' } : current
}

export function projectStructuredSaveLine(
  state: StructuredSaveState,
): { text: string; retryable: boolean; tone: 'muted' | 'error' } | null {
  if (state.status === 'saving') return { text: '保存中…', retryable: false, tone: 'muted' }
  if (state.status === 'saved') return { text: '已保存', retryable: false, tone: 'muted' }
  if (state.status === 'error') return { text: '没保存成功', retryable: true, tone: 'error' }
  return null
}
