import type { AutoModeWorkerBackend, AutoModeBackendHook } from '../types.js'
import { claudeHook } from './claude.js'
import { codebuddyHook } from './codebuddy.js'
import { codexHook } from './codex.js'

const HOOKS: Record<AutoModeWorkerBackend, AutoModeBackendHook> = {
  codex: codexHook,
  claude: claudeHook,
  codebuddy: codebuddyHook,
}

export function getAutoModeHook(backend: AutoModeWorkerBackend): AutoModeBackendHook {
  return HOOKS[backend]
}

export function getAutoModeBackendLabel(backend: AutoModeWorkerBackend): string {
  return HOOKS[backend]?.label ?? backend
}

export function listAutoModeHooks(): AutoModeBackendHook[] {
  return Object.values(HOOKS)
}

export function describeAutoControl(): string {
  return 'Auto off keeps the user driving directly; auto on lets Secretary drive the session and ask when blocked.'
}
