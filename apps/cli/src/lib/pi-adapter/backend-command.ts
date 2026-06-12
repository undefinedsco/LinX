import type { AutoModeNormalizedEvent } from '../auto-mode/types.js'
import type { SessionControlManager } from './session-control.js'

export type BackendCommandResult =
  | {
    handled: true
    message?: string
    clearInput?: boolean
  }
  | {
    handled: false
  }

export interface BackendCommandRouter {
  readonly backend: string
  execute(input: string): Promise<BackendCommandResult>
  setCwd?(cwd: string): Promise<void> | void
  subscribe?(listener: (event: AutoModeNormalizedEvent) => void): () => void
  setSessionControl?(control: SessionControlManager): void
}
