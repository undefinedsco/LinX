import {
  resolveAutoModeCommandRoute,
  type AutoModeControlCommandRoute,
  type AutoModePeerCommandRoute,
} from '@linx/agent-runtime/auto-mode'
import { listAutoModeSessions } from './archive.js'
import type { AutoModeDisplay } from './display.js'
import { formatAutoModeSessionSummary } from './format.js'
import { isAutoModeWorkerBackend, resolveApprovalStrategy } from './backend-kind.js'
import { appendAndDisplaySessionNote, appendSessionNote } from './session-log.js'
import type {
  AutoModeQueueState,
  AutoModeSessionRecord,
  AutoRunOptions,
} from './types.js'

export interface AutoModeShellCommandSession {
  setModel(model: string): Promise<void>
  applyResolvedOptions(options: AutoRunOptions): void
}

export interface AutoModeShellCommandAuthActions {
  login(display: AutoModeDisplay): Promise<void>
  logout(display: AutoModeDisplay): void
}

export type AutoModeShellCommandResult =
  | 'handled'
  | 'exit'
  | 'pass'
  | { kind: 'send'; text: string }

export async function handleAutoModeShellCommand(args: {
  input: string
  session: AutoModeShellCommandSession
  display: AutoModeDisplay
  queueState: AutoModeQueueState
  backend: string
  record: AutoModeSessionRecord
  auth?: AutoModeShellCommandAuthActions
}): Promise<AutoModeShellCommandResult> {
  const { input, session, display, queueState, backend, record } = args

  if (input === '/exit' || input === '/quit') {
    return 'exit'
  }

  if (input === '/help' || input === '/hotkeys' || input === '/keymap') {
    display.showHelp()
    return 'handled'
  }

  if (input === '/login') {
    try {
      await args.auth?.login(display)
      appendSessionNote(record, 'LinX Cloud login refreshed from auto-mode')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendAndDisplaySessionNote(record, display, `LinX Cloud login failed | ${message}`, 'error', { error: message })
    }
    return 'handled'
  }

  if (input === '/logout') {
    args.auth?.logout(display)
    appendSessionNote(record, 'LinX Cloud logout requested from auto-mode')
    return 'handled'
  }

  if (input === '/session') {
    appendAndDisplaySessionNote(record, display, [
      `session=${record.backendSessionId ?? record.id}`,
      `backend=${record.backend}`,
      `runtime=${record.runtime}`,
      'credentials=pod',
      `model=${record.model ?? 'default'}`,
      `cwd=${record.cwd}`,
    ].join(' | '))
    return 'handled'
  }

  const autoModeRoute = resolveAutoModeCommandRoute(input)
  if (autoModeRoute) {
    return handleAutoModeCommandRoute({
      route: autoModeRoute,
      session,
      display,
      record,
    })
  }

  if (input === '/queue') {
    appendAndDisplaySessionNote(record, display, `queue | steer=${queueState.steeringCount} | follow-up=${queueState.followUpCount}`)
    return 'handled'
  }

  if (input.startsWith('/follow-up ')) {
    return 'pass'
  }

  if (input === '/sessions') {
    const summaries = listAutoModeSessions().slice(0, 5).map(formatAutoModeSessionSummary)
    if (summaries.length === 0) {
      appendAndDisplaySessionNote(record, display, 'No archived auto-mode sessions found')
      return 'handled'
    }

    for (const summary of summaries) {
      appendAndDisplaySessionNote(record, display, summary)
    }
    return 'handled'
  }

  if (input === '/new') {
    appendAndDisplaySessionNote(record, display, 'Use `linx --backend <backend>` to start a fresh auto-mode session')
    return 'handled'
  }

  if (input === '/debug' || input === '/debug on') {
    display.setDebugMode(true)
    appendSessionNote(record, 'Debug protocol view enabled', { debug: true })
    return 'handled'
  }

  if (input === '/debug off') {
    display.setDebugMode(false)
    appendSessionNote(record, 'Debug protocol view disabled', { debug: false })
    return 'handled'
  }

  if (input.startsWith('/model ')) {
    const model = input.slice('/model '.length).trim()
    if (!model) {
      appendAndDisplaySessionNote(record, display, 'Usage: /model <modelId>', 'error')
      return 'handled'
    }

    try {
      await session.setModel(model)
      appendAndDisplaySessionNote(record, display, `Model set to ${model}`, 'success', { backend, model })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      appendAndDisplaySessionNote(record, display, `Model switch failed | ${reason}`, 'error', { backend, model, reason })
    }
    return 'handled'
  }

  return 'pass'
}

function handleAutoModeCommandRoute(args: {
  route: AutoModeControlCommandRoute | AutoModePeerCommandRoute
  session: AutoModeShellCommandSession
  display: AutoModeDisplay
  record: AutoModeSessionRecord
}): 'handled' | { kind: 'send'; text: string } {
  const { route, session, display, record } = args
  if (route.kind === 'control-command') {
    return handleAutoModeControlCommand({ route, session, display, record })
  }
  return handleAutoModePeerCommand({ route, session, display, record })
}

function handleAutoModeControlCommand(args: {
  route: AutoModeControlCommandRoute
  session: AutoModeShellCommandSession
  display: AutoModeDisplay
  record: AutoModeSessionRecord
}): 'handled' | { kind: 'send'; text: string } {
  const { route, session, display, record } = args
  const auto = route.auto
  if (!auto || auto.action === 'status') {
    const enabled = record.autoEnabled === true
    appendAndDisplaySessionNote(record, display, `Auto is ${enabled ? 'on' : 'off'}. Use /auto on or /auto off.`)
    return 'handled'
  }

  if (!isAutoModeWorkerBackend(record.backend)) {
    throw new Error(`Auto control commands cannot run backend ${record.backend}`)
  }

  applyAutoModeAutoEnabled(session, record, auto.enabled)
  appendAndDisplaySessionNote(
    record,
    display,
    `Auto ${auto.enabled ? 'on' : 'off'}: ${auto.enabled ? 'Secretary drives the session and asks when blocked' : 'user drives the session directly'}.`,
    'success',
    { autoEnabled: auto.enabled },
  )

  if (auto.initialInput) {
    const projectedRoute = resolveAutoModeCommandRoute(auto.initialInput)
    if (projectedRoute) {
      return handleAutoModeCommandRoute({
        route: projectedRoute,
        session,
        display,
        record,
      })
    }
    return { kind: 'send', text: auto.initialInput }
  }
  return 'handled'
}

function handleAutoModePeerCommand(args: {
  route: AutoModePeerCommandRoute
  session: AutoModeShellCommandSession
  display: AutoModeDisplay
  record: AutoModeSessionRecord
}): { kind: 'send'; text: string } {
  const { route, session, display, record } = args
  const goalMirror = route.secretaryBehavior?.goalMode
  if (goalMirror !== undefined) {
    applyAutoModeGoalMode(session, record, goalMirror)
    appendAndDisplaySessionNote(
      record,
      display,
      `Goal command routed to current chat peer; local supervision mirror is ${goalMirror ? 'active' : 'paused'}.`,
      'success',
      { goalMode: goalMirror, peerCommand: route.text },
    )
  } else {
    appendAndDisplaySessionNote(
      record,
      display,
      'Goal command routed to current chat peer.',
      'note',
      { peerCommand: route.text },
    )
  }
  return { kind: 'send', text: route.text }
}

function applyAutoModeAutoEnabled(
  session: AutoModeShellCommandSession,
  record: AutoModeSessionRecord,
  enabled: boolean,
): void {
  session.applyResolvedOptions({
    backend: record.backend,
    autoEnabled: enabled,
    mode: enabled ? 'auto' : 'off',
    cwd: record.cwd,
    plain: false,
    model: record.model,
    prompt: record.prompt,
    passthroughArgs: record.passthroughArgs,
    goalMode: record.goalMode,
    runtime: record.runtime,
    transport: record.transport,
    credentialSource: record.credentialSource,
    resolvedCredentialSource: record.resolvedCredentialSource,
    approvalStrategy: resolveApprovalStrategy({ approvalStrategy: record.approvalSource }),
  })
  record.autoEnabled = enabled
  record.mode = enabled ? 'auto' : 'off'
}

function applyAutoModeGoalMode(
  session: AutoModeShellCommandSession,
  record: AutoModeSessionRecord,
  enabled: boolean,
): void {
  if (!isAutoModeWorkerBackend(record.backend)) {
    throw new Error(`Goal peer commands cannot run backend ${record.backend}`)
  }

  session.applyResolvedOptions({
    backend: record.backend,
    autoEnabled: record.autoEnabled === true,
    mode: record.mode,
    cwd: record.cwd,
    plain: false,
    model: record.model,
    prompt: record.prompt,
    passthroughArgs: record.passthroughArgs,
    goalMode: enabled,
    runtime: record.runtime,
    transport: record.transport,
    credentialSource: record.credentialSource,
    resolvedCredentialSource: record.resolvedCredentialSource,
    approvalStrategy: resolveApprovalStrategy({ approvalStrategy: record.approvalSource }),
  })
  record.goalMode = enabled || undefined
}
