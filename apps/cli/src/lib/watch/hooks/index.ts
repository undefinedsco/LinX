import type { WatchBackend, WatchBackendHook, WatchMode } from '../types.js'
import { claudeHook } from './claude.js'
import { codebuddyHook } from './codebuddy.js'
import { codexHook } from './codex.js'

const HOOKS: Record<WatchBackend, WatchBackendHook> = {
  codex: codexHook,
  claude: claudeHook,
  codebuddy: codebuddyHook,
}

export function getWatchHook(backend: WatchBackend): WatchBackendHook {
  return HOOKS[backend]
}

export function listWatchHooks(): WatchBackendHook[] {
  return Object.values(HOOKS)
}

export function describeWatchMode(mode: WatchMode): string {
  if (mode === 'manual') {
    return 'Prefer user approval for risky or ambiguous actions.'
  }

  if (mode === 'smart') {
    return 'Let the backend auto-resolve low-risk steps and escalate the rest.'
  }

  return 'Let the backend run with minimal user gating.'
}
