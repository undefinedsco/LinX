import { registerLinxInteractiveEventHandler } from './linx-interactive-event-router.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'
import { getLinxInteractiveTurnResponsePendingStatusTimeoutMs } from './linx-interactive-shell-state.js'

const DEFAULT_TURN_RESPONSE_PENDING_STATUS_TIMEOUT_MS = 8_000
const turnResponseWatchdogs = new WeakMap<object, TurnResponseWatchdogState>()
const turnResponseWatchdogInstalled = new WeakSet<object>()

type TurnResponseWatchdogState = {
  input: string
  timer?: ReturnType<typeof setTimeout>
  phase: 'submitted' | 'agent-started'
}

export function installLinxInteractiveTurnResponseWatchdog(interactive: any): void {
  if (!interactive || turnResponseWatchdogInstalled.has(interactive)) {
    return
  }

  registerLinxInteractiveEventHandler(interactive, {
    name: 'linx-turn-response-watchdog',
    priority: -10,
    handler({ interactive: target, event }) {
      handleLinxInteractiveTurnResponseEvent(target, event)
      return { handled: false }
    },
  })

  turnResponseWatchdogInstalled.add(interactive)
}

export function startLinxInteractiveTurnResponseWatchdog(interactive: any, input: string): void {
  if (!interactive || !shouldWatchTurnResponseInput(input)) {
    return
  }

  const state: TurnResponseWatchdogState = {
    input,
    phase: 'submitted',
  }
  replaceTurnResponseWatchdog(interactive, state)
}

function handleLinxInteractiveTurnResponseEvent(interactive: any, event: unknown): void {
  const state = getTurnResponseWatchdog(interactive)
  if (!state || !isRecord(event)) {
    return
  }

  const type = event.type
  if (type === 'agent_start') {
    state.phase = 'agent-started'
    scheduleTurnResponseStatus(interactive, state)
    return
  }

  if (type === 'message_update' && isAssistantMessageWithVisibleContent(event.message)) {
    clearTurnResponseWatchdog(interactive)
    return
  }

  if (type === 'message_end' && isAssistantMessage(event.message)) {
    clearTurnResponseWatchdog(interactive)
    return
  }

  if (type === 'agent_end') {
    clearTurnResponseWatchdog(interactive)
  }
}

function replaceTurnResponseWatchdog(interactive: any, state: TurnResponseWatchdogState): void {
  clearTurnResponseWatchdog(interactive)
  if (interactive && typeof interactive === 'object') {
    turnResponseWatchdogs.set(interactive, state)
    scheduleTurnResponseStatus(interactive, state)
  }
}

function getTurnResponseWatchdog(interactive: any): TurnResponseWatchdogState | undefined {
  return interactive && typeof interactive === 'object'
    ? turnResponseWatchdogs.get(interactive)
    : undefined
}

export function clearLinxInteractiveTurnResponseWatchdog(interactive: any): void {
  clearTurnResponseWatchdog(interactive)
}

function clearTurnResponseWatchdog(interactive: any): void {
  const state = getTurnResponseWatchdog(interactive)
  if (state?.timer) {
    clearTimeout(state.timer)
  }
  if (interactive && typeof interactive === 'object') {
    turnResponseWatchdogs.delete(interactive)
  }
}

function scheduleTurnResponseStatus(interactive: any, state: TurnResponseWatchdogState): void {
  if (state.timer) {
    clearTimeout(state.timer)
  }

  state.timer = setTimeout(() => {
    const current = getTurnResponseWatchdog(interactive)
    if (current !== state) {
      return
    }
    showLinxInteractiveStatus(interactive, formatTurnResponsePendingStatus(state))
  }, resolveTurnResponsePendingStatusTimeoutMs(interactive))
  state.timer.unref?.()
}

function resolveTurnResponsePendingStatusTimeoutMs(interactive: any): number {
  const configured = getLinxInteractiveTurnResponsePendingStatusTimeoutMs(interactive)
  return typeof configured === 'number' && Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_TURN_RESPONSE_PENDING_STATUS_TIMEOUT_MS
}

function formatTurnResponsePendingStatus(state: TurnResponseWatchdogState): string {
  if (state.phase === 'agent-started') {
    return 'Still waiting for a response from LinX Cloud/backend; the model call has not produced content yet.'
  }
  return 'Still waiting for a response; the submitted message is queued but no backend activity has arrived yet.'
}

function shouldWatchTurnResponseInput(input: string): boolean {
  const normalized = input.trim()
  return Boolean(normalized)
    && !normalized.startsWith('/')
    && !normalized.startsWith('!')
}

function isAssistantMessage(value: unknown): boolean {
  return isRecord(value) && value.role === 'assistant'
}

function isAssistantMessageWithVisibleContent(value: unknown): boolean {
  if (!isAssistantMessage(value)) {
    return false
  }
  const content = (value as { content?: unknown }).content
  return Array.isArray(content) && content.some((entry) => {
    if (!isRecord(entry)) {
      return false
    }
    if (entry.type === 'text') {
      return typeof entry.text === 'string' && entry.text.length > 0
    }
    return entry.type === 'toolCall'
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}
