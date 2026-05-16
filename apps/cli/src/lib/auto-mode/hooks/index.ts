import type { AutoModeBackend, AutoModeBackendHook, AutoModeMode } from '../types.js'
import { claudeHook } from './claude.js'
import { codebuddyHook } from './codebuddy.js'
import { codexHook } from './codex.js'

const HOOKS: Record<AutoModeBackend, AutoModeBackendHook> = {
  codex: codexHook,
  claude: claudeHook,
  codebuddy: codebuddyHook,
}

export function getAutoModeHook(backend: AutoModeBackend): AutoModeBackendHook {
  return HOOKS[backend]
}

export function getAutoModeBackendLabel(backend: AutoModeBackend): string {
  return HOOKS[backend]?.label ?? backend
}

export function listAutoModeHooks(): AutoModeBackendHook[] {
  return Object.values(HOOKS)
}

export function describeAutoModeMode(mode: AutoModeMode): string {
  if (mode === 'manual') {
    return 'Wait for user approval instead of letting AI secretary decide.'
  }

  if (mode === 'smart') {
    return 'Let AI secretary auto-resolve clear low-risk approvals and escalate the rest.'
  }

  return 'Let AI secretary handle approvals automatically after the user reaction window.'
}
