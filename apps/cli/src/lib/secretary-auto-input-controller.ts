import {
  createAgentRuntime,
  resolveAgentRuntimeConfig,
  runThreadReconcilerCycle,
  type AgentRuntimeBackendConfig,
  type AgentRuntimeConfig,
  type AgentRuntimeCompletionResult,
  type AgentRuntimeMessage,
  type ReconcileDecisionSummary,
  type ThreadControlEvent,
  type WakeJobSchedulerSnapshotSummary,
} from '@linx/agent-runtime'
import { createRemoteCompletionResult, isRemoteAuthExpiredError } from './chat-api.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from './default-model.js'
import { getDefaultPodDataSession, type PodDataSession } from './pod-data-session.js'
import { resolveRuntimeTarget } from './runtime-target.js'
import type { SessionControlManager, SessionControlSnapshot } from './session-control.js'
import { registerLinxInteractiveStopHandler } from './linx-interactive-stop-router.js'
import {
  canSubmitLinxInteractiveSessionUserInputNow,
  submitLinxInteractiveSessionUserInput,
  subscribeLinxInteractiveSessionEvents,
} from './linx-session-work-control.js'
import { getLinxActiveSessionAgentMessages, getLinxActiveSessionHistoryEntries } from './linx-session-history.js'
import { resolveLinxSessionCwd, resolveLinxSessionModelId } from './linx-session-metadata.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'
import {
  getLinxInteractiveAutoInputController,
  getLinxInteractiveGoalModeSupervisorLastAt,
  getLinxInteractiveGoalModeSupervisorIntervalMs,
  getLinxInteractiveSymphonyWorkerSupervisorIntervalMs,
  handleLinxInteractiveProjectedCommand,
  isLinxInteractiveAutoModeEnabled,
  isLinxInteractiveGoalModeEnabled,
  setLinxInteractiveAutoInputController,
  setLinxInteractiveGoalModeSupervisorLastAt,
} from './linx-interactive-shell-state.js'

const AUTO_INPUT_DELAY_MS = 50
const AUTO_INPUT_IDLE_WATCHDOG_MS = 1_000
const DEFAULT_AUTO_INPUT_RECOVERY_DELAYS_MS = [500, 1_500, 3_000] as const
const DEFAULT_TRANSIENT_REMOTE_RECOVERY_DELAY_MS = 30_000
const DEFAULT_GOAL_MODE_SUPERVISOR_INTERVAL_MS = 10 * 60 * 1000
const MAX_CONTEXT_MESSAGES = 16
const MAX_CONTEXT_CHARS = 12_000
const MAX_GENERATED_INPUT_CHARS = 8_000
const MAX_AUTO_INPUT_ATTEMPTS = 2
const SECRETARY_AGENT_ID = '__secretary__'
const SECRETARY_AGENT_LABEL = 'AI Secretary'
const DEFAULT_SECRETARY_RUNTIME_BACKEND: AgentRuntimeBackendConfig = {
  backend: 'linx',
  model: DEFAULT_LINX_CLOUD_MODEL_ID,
  credentialSource: 'cloud',
}
const SECRETARY_SYSTEM_PROMPT = [
  'You are the LinX AI Secretary running the auto input controller.',
  'Auto mode is on, so you are taking over the next user input slot for the active backend session.',
  'Produce only the exact next user message to submit.',
  'Do not include reasoning, labels, markdown fences, or explanations.',
  'When the backend asks for ordinary conversational input, a game move, or a next turn you can reasonably infer, answer as the user and keep the session moving.',
  'For games, including 成语接龙, provide the next valid move directly.',
  'When goal mode is on, act as a supervisor: send a concise steer only when the current chat peer needs direction, and return empty when no intervention is needed.',
  'Outside goal mode, return an empty response only for missing credentials, missing authority, unsafe or destructive action, or genuinely unresolvable ambiguity.',
].join(' ')
const SECRETARY_RETRY_PREFIX = [
  'The previous auto-input attempt returned empty.',
  'Auto mode should not stop for ordinary conversation, games, or backend requests for the next user turn.',
  'Return empty only for missing credentials, missing authority, unsafe or destructive action, or genuinely unresolvable ambiguity.',
  'Otherwise write the exact next user input now.',
].join('\n')

export interface SecretaryAutoInputController {
  start(options?: { scheduleImmediately?: boolean }): void
  stop(): void
  schedule(reason: SecretaryAutoInputReason): void
  submit(text: string, options?: { reason?: SecretaryAutoInputReason }): Promise<void>
}

export type SecretaryAutoInputReason = 'auto-on' | 'agent-end' | 'runtime-idle'

interface SecretaryAutoInputContext {
  snapshot: SessionControlSnapshot
  backend?: string
  cwd: string
  model?: string
  goalMode: boolean
  supervisorIntervalMs?: number
  reconciliation?: ReconcileDecisionSummary
  recentMessages: Array<{
    role: string
    text: string
  }>
}

type ResolveNextUserInput = (context: SecretaryAutoInputContext) => Promise<string | null | undefined> | string | null | undefined

export function getSecretaryAutoInputController(
  interactive: any,
  runtime: any,
  sessionControl: SessionControlManager,
): SecretaryAutoInputController {
  const existing = getLinxInteractiveAutoInputController<SecretaryAutoInputController>(interactive)
  if (existing) {
    return existing
  }

  const controller = new SecretaryAutoInputControllerImpl(interactive, runtime, sessionControl)
  if (interactive && typeof interactive === 'object') {
    setLinxInteractiveAutoInputController(interactive, controller)
  }
  return controller
}

class SecretaryAutoInputControllerImpl implements SecretaryAutoInputController {
  private active = false
  private running = false
  private scheduled: NodeJS.Timeout | null = null
  private idleWatchdog: NodeJS.Timeout | null = null
  private recoveryTimer: NodeJS.Timeout | null = null
  private pendingReason: SecretaryAutoInputReason | null = null
  private generation = 0
  private unsubscribe: (() => void) | null = null
  private recoveryAttempts = 0
  private pausedAssistantSignature: string | null = null
  private goalModeSupervisedAssistantSignature: string | null = null
  private currentTurnAbortController: AbortController | null = null

  constructor(
    private readonly interactive: any,
    private readonly runtime: any,
    private readonly sessionControl: SessionControlManager,
  ) {}

  start(options: { scheduleImmediately?: boolean } = {}): void {
    if (this.active) {
      if (options.scheduleImmediately !== false) {
        this.schedule('auto-on')
      }
      return
    }

    this.active = true
    this.generation += 1
    this.installRuntimeHooks()
    this.startIdleWatchdog()
    if (options.scheduleImmediately !== false) {
      this.schedule('auto-on')
    }
  }

  stop(): void {
    this.active = false
    this.generation += 1
    this.pendingReason = null
    this.abortCurrentTurn()
    if (this.scheduled) {
      clearTimeout(this.scheduled)
      this.scheduled = null
    }
    this.clearRecoveryTimer()
    this.stopIdleWatchdog()
    this.recoveryAttempts = 0
    this.pausedAssistantSignature = null
    this.goalModeSupervisedAssistantSignature = null
  }

  private abortCurrentTurn(): void {
    this.currentTurnAbortController?.abort()
    this.currentTurnAbortController = null
  }

  schedule(reason: SecretaryAutoInputReason): void {
    if (!this.active) {
      return
    }

    this.pendingReason = reason
    this.clearRecoveryTimer()
    if (this.scheduled || this.running) {
      return
    }

    this.scheduled = setTimeout(() => {
      this.scheduled = null
      void this.runOnce()
    }, AUTO_INPUT_DELAY_MS)
  }

  async submit(text: string, options: { reason?: SecretaryAutoInputReason } = {}): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }
    if (!this.active) {
      this.start({ scheduleImmediately: false })
    }

    const reason = options.reason ?? 'auto-on'
    const snapshot = this.sessionControl.ensureControlSession('auto')
    const backend = normalizeString(this.runtime?.backendCommandRouter?.backend)
      ?? normalizeString(this.runtime?.backendSessionRef?.backend)
      ?? normalizeString(this.runtime?.backend)

    try {
      const projection = this.sessionControl.recordSecretaryRuntimeIntent({
        text: trimmed,
        reason,
      })
      const delivery = await deliverProjectedInput(this.interactive, trimmed)
      this.sessionControl.recordAutoInputEvent('delivered', {
        reason,
        runtimeProjection: {
          targetRole: projectedDeliveryTargetRole(delivery),
          source: 'secretary-runtime-intent',
          controlDecision: projection,
        },
        businessSession: snapshot.businessSession,
        backend,
        length: trimmed.length,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.sessionControl.recordAutoInputEvent('failed', {
        reason,
        message,
        businessSession: snapshot.businessSession,
        backend,
      })
      throw error
    }
  }

  private installRuntimeHooks(): void {
    if (this.unsubscribe) {
      return
    }

    const unsubscribe = subscribeLinxInteractiveSessionEvents(this.interactive, (event: unknown) => {
      if (!isRecord(event) || event.type !== 'agent_end') {
        return
      }
      if (isGoalModeActive(this.interactive, this.runtime)) {
        return
      }
      this.schedule('agent-end')
    })
    if (!unsubscribe) {
      return
    }

    this.unsubscribe = unsubscribe

    registerLinxInteractiveStopHandler(this.interactive, {
      name: 'linx-auto-input-controller',
      phase: 'before',
      priority: 10,
      handler: () => {
        this.stop()
        this.unsubscribe?.()
        this.unsubscribe = null
      },
    })
  }

  private startIdleWatchdog(): void {
    if (this.idleWatchdog) {
      return
    }

    this.idleWatchdog = setInterval(() => {
      if (!this.active || this.running || this.scheduled || this.recoveryTimer || !isLinxInteractiveAutoModeEnabled(this.interactive, this.runtime)) {
        return
      }

      if (!canSubmitLinxInteractiveSessionUserInputNow(this.interactive)) {
        return
      }

      const recentMessages = resolveRecentMessages(this.interactive)
      const latest = recentMessages.at(-1)
      if (latest?.role !== 'assistant') {
        return
      }

      const signature = createAssistantSignature(latest.text)
      if (signature && signature === this.pausedAssistantSignature) {
        return
      }

      if (isGoalModeActive(this.interactive, this.runtime)) {
        if (signature && signature === this.goalModeSupervisedAssistantSignature) {
          return
        }
        if (!isGoalModeSupervisorDue(this.interactive, this.runtime)) {
          return
        }
        markGoalModeSupervisorChecked(this.interactive, this.runtime)
        this.goalModeSupervisedAssistantSignature = signature
        this.schedule('runtime-idle')
        return
      }

      this.goalModeSupervisedAssistantSignature = null
      this.schedule('runtime-idle')
    }, AUTO_INPUT_IDLE_WATCHDOG_MS)

    this.idleWatchdog.unref?.()
  }

  private stopIdleWatchdog(): void {
    if (!this.idleWatchdog) {
      return
    }

    clearInterval(this.idleWatchdog)
    this.idleWatchdog = null
  }

  private async runOnce(): Promise<void> {
    if (!this.active || this.running || !isLinxInteractiveAutoModeEnabled(this.interactive, this.runtime)) {
      return
    }

    if (!canSubmitLinxInteractiveSessionUserInputNow(this.interactive)) {
      return
    }

    this.running = true
    const generation = this.generation
    const reason = this.pendingReason
    this.pendingReason = null
    const turnAbortController = new AbortController()
    this.currentTurnAbortController = turnAbortController
    let context: SecretaryAutoInputContext | null = null

    try {
      context = this.buildContext()
      if (!context || !shouldGenerateNextUserInput(context)) {
        this.resetRecoveryState()
        return
      }
      if (resolveAssistantSignature(context) === this.pausedAssistantSignature) {
        return
      }

      const execution = await this.runThroughThreadReconciler({
        context,
        reason,
        generation,
        signal: turnAbortController.signal,
      })
      context = execution.context
      const { reconciliation, scheduler, turn, text, attempts } = execution
      if (!this.active || generation !== this.generation || !isLinxInteractiveAutoModeEnabled(this.interactive, this.runtime)) {
        this.sessionControl.recordAutoInputEvent('failed', {
          reason,
          message: 'AI Secretary auto input projection was cancelled before delivery',
          run: summarizeRuntimeRun(turn.run),
          steps: summarizeRuntimeSteps(turn.steps),
          businessSession: context.snapshot.businessSession,
          backend: context.backend,
          reconciler: reconciliation,
          scheduler,
          attempts,
        })
        this.scheduleRecovery('runtime-idle', 'AI Secretary returned empty user input projection', context, generation)
        return
      }

      if (!text) {
        if (context.goalMode) {
          this.resetRecoveryState()
          this.sessionControl.recordAutoInputEvent('skipped', {
            reason,
            message: 'Goal supervision found no Secretary intervention needed.',
            run: summarizeRuntimeRun(turn.run),
            steps: summarizeRuntimeSteps(turn.steps),
            businessSession: context.snapshot.businessSession,
            backend: context.backend,
            reconciler: reconciliation,
            scheduler,
            attempts,
          })
          return
        }

        this.sessionControl.recordAutoInputEvent('failed', {
          reason,
          message: 'AI Secretary returned empty user input projection',
          run: summarizeRuntimeRun(turn.run),
          steps: summarizeRuntimeSteps(turn.steps),
          businessSession: context.snapshot.businessSession,
          backend: context.backend,
          reconciler: reconciliation,
          scheduler,
          attempts,
        })
        this.scheduleRecovery('runtime-idle', 'AI Secretary returned empty user input projection', context, generation)
        return
      }

      const projection = this.sessionControl.recordSecretaryRuntimeIntent({
        text,
        reason,
      })
      const delivery = await deliverProjectedInput(this.interactive, text)
      this.resetRecoveryState()
      this.sessionControl.recordAutoInputEvent('delivered', {
        reason,
        runtimeProjection: {
          targetRole: projectedDeliveryTargetRole(delivery),
          source: 'secretary-runtime-intent',
          controlDecision: projection,
        },
        run: summarizeRuntimeRun(turn.run),
        steps: summarizeRuntimeSteps(turn.steps),
        businessSession: context.snapshot.businessSession,
        backend: context.backend,
        reconciler: reconciliation,
        scheduler,
        length: text.length,
        attempts,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.sessionControl.recordAutoInputEvent('failed', {
        reason,
        message,
        run: isAgentRuntimeTurnError(error) ? summarizeRuntimeRun(error.run) : undefined,
        steps: isAgentRuntimeTurnError(error) ? summarizeRuntimeSteps(error.steps) : undefined,
      })
      this.scheduleRecovery('runtime-idle', message, context, generation, error)
    } finally {
      this.running = false
      if (this.currentTurnAbortController === turnAbortController) {
        this.currentTurnAbortController = null
      }
      if (this.active && this.pendingReason) {
        this.schedule(this.pendingReason)
      }
    }
  }

  private buildContext(): SecretaryAutoInputContext | null {
    const snapshot = this.sessionControl.ensureControlSession('auto')
    const recentMessages = resolveRecentMessages(this.interactive)
    if (recentMessages.length === 0) {
      return null
    }

    return {
      snapshot,
      backend: normalizeString(this.runtime?.backendCommandRouter?.backend)
        ?? normalizeString(this.runtime?.backendSessionRef?.backend)
        ?? normalizeString(this.runtime?.backend),
      cwd: resolveLinxSessionCwd({ interactive: this.interactive, runtime: this.runtime }, snapshot.businessSession.cwd),
      model: resolveLinxSessionModelId({ interactive: this.interactive, runtime: this.runtime }),
      goalMode: isGoalModeActive(this.interactive, this.runtime),
      supervisorIntervalMs: resolveGoalModeSupervisorIntervalMs(this.interactive, this.runtime),
      recentMessages,
    }
  }

  private async runThroughThreadReconciler(input: {
    context: SecretaryAutoInputContext
    reason: SecretaryAutoInputReason | null
    generation: number
    signal?: AbortSignal
  }): Promise<{
    context: SecretaryAutoInputContext
    reconciliation: ReconcileDecisionSummary
    scheduler: WakeJobSchedulerSnapshotSummary
    turn: Awaited<ReturnType<ReturnType<typeof createAgentRuntime>['runTurn']>>
    text: string | null
    attempts: number
  }> {
    let context: SecretaryAutoInputContext | null = null
    let inputText = ''
    let wakeError: unknown
    let turn: Awaited<ReturnType<ReturnType<typeof createAgentRuntime>['runTurn']>> | null = null
    let text: string | null = null
    let attempts = 1
    const injectedResolver = resolveInjectedResolver(this.runtime)
    const cycle = await runThreadReconcilerCycle({
      policy: {
        kind: 'auto',
        secretaryAgent: SECRETARY_AGENT_ID,
      },
      handleWakeJob: async ({ decisionSummary }) => {
        try {
          const reconciliation = decisionSummary
          context = {
            ...input.context,
            reconciliation,
          }
          inputText = renderSecretaryAutoInputContext(context)
          const firstTurn = await runSecretaryAutoInputTurn({
            runtime: this.runtime,
            context,
            reason: input.reason,
            inputText,
            injectedResolver,
            reconciliation,
            attempt: 1,
            signal: input.signal,
          })
          const firstText = normalizeGeneratedInput(firstTurn.content)
          const shouldRetry = !firstText
            && this.active
            && input.generation === this.generation
            && isLinxInteractiveAutoModeEnabled(this.interactive, this.runtime)
          turn = shouldRetry
            ? await runSecretaryAutoInputTurn({
              runtime: this.runtime,
              context,
              reason: input.reason,
              inputText: renderSecretaryAutoInputRetryContext(inputText),
              injectedResolver,
              reconciliation,
              attempt: 2,
              signal: input.signal,
            })
            : firstTurn
          attempts = shouldRetry ? MAX_AUTO_INPUT_ATTEMPTS : 1
          text = shouldRetry ? normalizeGeneratedInput(turn.content) : firstText
          return {
            attempts,
            textLength: text?.length ?? 0,
            run: turn.run.id,
          }
        } catch (error) {
          wakeError = error
          throw error
        }
      },
      event: createAutoInputThreadEvent(input.context, input.reason),
      dispatchOptions: {
        randomId: `auto-${input.reason ?? 'scheduled'}-${Date.now()}`,
      },
      onDispatched: (dispatch) => {
        const reconciliation = dispatch.summary
        context = {
          ...input.context,
          reconciliation,
        }
        inputText = renderSecretaryAutoInputContext(context)
        this.sessionControl.recordAutoInputEvent('requested', {
          reason: input.reason,
          businessSession: context.snapshot.businessSession,
          backend: context.backend,
          reconciler: reconciliation,
          scheduler: {
            wakeRecords: dispatch.wakeRecordSummaries,
          },
        })
      },
    })

    const reconciliation = cycle.summary
    const scheduler = cycle.schedulerSummary
    if (scheduler.failed.length > 0) {
      throw wakeError ?? new Error(String(scheduler.failed[0]?.error ?? 'AI Secretary wake job failed'))
    }
    if (!turn) {
      throw new Error('AI Secretary was not awakened for auto input.')
    }
    if (!context) {
      throw new Error('AI Secretary auto input context was not prepared by the Thread Reconciler.')
    }

    return {
      context,
      reconciliation,
      scheduler,
      turn,
      text,
      attempts,
    }
  }

  private scheduleRecovery(
    reason: SecretaryAutoInputReason,
    message: string,
    context: SecretaryAutoInputContext | null,
    generation: number,
    error?: unknown,
  ): void {
    if (!this.active || generation !== this.generation || !isLinxInteractiveAutoModeEnabled(this.interactive, this.runtime)) {
      return
    }

    if (!isRecoverableAutoInputFailure(message, error)) {
      this.pauseOnAssistant(context, `Auto waiting for user: ${message}`)
      return
    }

    if (isTransientRemoteAutoInputFailure(message, error)) {
      this.scheduleTransientRemoteRecovery(reason, message, generation)
      return
    }

    const recoveryDelaysMs = resolveAutoInputRecoveryDelaysMs()
    if (this.recoveryAttempts >= recoveryDelaysMs.length) {
      this.pauseOnAssistant(context, `Auto waiting for user: Secretary could not recover after ${this.recoveryAttempts} restart attempts. ${message}`)
      return
    }

    const attempt = this.recoveryAttempts + 1
    const delayMs = recoveryDelaysMs[this.recoveryAttempts]
    this.recoveryAttempts = attempt
    this.clearRecoveryTimer()
    showLinxInteractiveStatus(this.interactive, `Auto recovering: restarting Secretary (${attempt}/${recoveryDelaysMs.length}).`)
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null
      if (!this.active || generation !== this.generation || !isLinxInteractiveAutoModeEnabled(this.interactive, this.runtime)) {
        return
      }
      this.schedule(reason)
    }, delayMs)
    this.recoveryTimer.unref?.()
  }

  private scheduleTransientRemoteRecovery(
    reason: SecretaryAutoInputReason,
    message: string,
    generation: number,
  ): void {
    const attempt = this.recoveryAttempts + 1
    const delayMs = resolveTransientRemoteRecoveryDelayMs()
    this.recoveryAttempts = attempt
    this.clearRecoveryTimer()
    showLinxInteractiveStatus(this.interactive, `Auto waiting for LinX Cloud: temporarily unavailable. Secretary will retry in ${formatDelay(delayMs)}. ${message}`)
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null
      if (!this.active || generation !== this.generation || !isLinxInteractiveAutoModeEnabled(this.interactive, this.runtime)) {
        return
      }
      this.schedule(reason)
    }, delayMs)
    this.recoveryTimer.unref?.()
  }

  private pauseOnAssistant(context: SecretaryAutoInputContext | null, message: string): void {
    this.pausedAssistantSignature = context ? resolveAssistantSignature(context) : null
    this.clearRecoveryTimer()
    showLinxInteractiveStatus(this.interactive, message)
  }

  private clearRecoveryTimer(): void {
    if (!this.recoveryTimer) {
      return
    }

    clearTimeout(this.recoveryTimer)
    this.recoveryTimer = null
  }

  private resetRecoveryState(): void {
    this.recoveryAttempts = 0
    this.pausedAssistantSignature = null
    this.clearRecoveryTimer()
  }
}

function shouldGenerateNextUserInput(context: SecretaryAutoInputContext): boolean {
  const latest = context.recentMessages.at(-1)
  return latest?.role === 'assistant'
}

function isGoalModeActive(interactive: any, runtime: any): boolean {
  return isLinxInteractiveGoalModeEnabled(interactive, runtime)
}

function resolveGoalModeSupervisorIntervalMs(interactive: any, runtime: any): number {
  const value = Number(
    getLinxInteractiveGoalModeSupervisorIntervalMs(interactive)
      ?? runtime?.goalModeSupervisorIntervalMs
      ?? getLinxInteractiveSymphonyWorkerSupervisorIntervalMs(interactive)
      ?? runtime?.symphonyWorkerSupervisorIntervalMs
      ?? DEFAULT_GOAL_MODE_SUPERVISOR_INTERVAL_MS,
  )
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_GOAL_MODE_SUPERVISOR_INTERVAL_MS
  }
  return Math.trunc(value)
}

function resolveGoalModeSupervisorLastAt(interactive: any, runtime: any): number {
  return getLinxInteractiveGoalModeSupervisorLastAt(interactive, runtime)
}

function markGoalModeSupervisorChecked(interactive: any, runtime: any, at = Date.now()): void {
  setLinxInteractiveGoalModeSupervisorLastAt(interactive, runtime, at)
}

function isGoalModeSupervisorDue(interactive: any, runtime: any): boolean {
  const now = Date.now()
  const lastAt = resolveGoalModeSupervisorLastAt(interactive, runtime)
  if (!lastAt) {
    markGoalModeSupervisorChecked(interactive, runtime, now)
    return false
  }
  return now - lastAt >= resolveGoalModeSupervisorIntervalMs(interactive, runtime)
}

function createAutoInputThreadEvent(
  context: SecretaryAutoInputContext,
  reason: SecretaryAutoInputReason | null,
): ThreadControlEvent {
  const businessSession = context.snapshot.businessSession
  const thread = businessSession.id ?? businessSession.file ?? `cwd:${businessSession.cwd}`
  return {
    type: 'message.appended',
    thread,
    chat: businessSession.id ?? businessSession.file,
    actor: {
      id: context.backend ?? 'backend-runtime',
      role: 'primary-agent',
    },
    data: {
      source: 'primary-agent',
      reason,
      backend: context.backend,
      businessSession: businessSession.id,
    },
  }
}

function resolveInjectedResolver(runtime: any): ResolveNextUserInput | null {
  const candidates = [
    runtime?.sessionControl?.resolveNextUserInput,
    runtime?.resolveNextUserInput,
    runtime?.resolveSecretaryNextUserInput,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      return candidate
    }
  }
  return null
}

async function runSecretaryAutoInputTurn(input: {
  runtime: any
  context: SecretaryAutoInputContext
  reason: SecretaryAutoInputReason | null
  inputText: string
  injectedResolver: ResolveNextUserInput | null
  reconciliation?: ReconcileDecisionSummary
  attempt: number
  signal?: AbortSignal
}): Promise<Awaited<ReturnType<ReturnType<typeof createAgentRuntime>['runTurn']>>> {
  const startupOverride = resolveAgentRuntimeStartupOverride(input.runtime)
  const agentConfig = resolveAgentRuntimeConfig({
    agent: SECRETARY_AGENT_ID,
    role: 'secretary',
    model: DEFAULT_LINX_CLOUD_MODEL_ID,
    label: SECRETARY_AGENT_LABEL,
    runtime: DEFAULT_SECRETARY_RUNTIME_BACKEND,
    systemPrompt: SECRETARY_SYSTEM_PROMPT,
    metadata: {
      mode: 'auto',
      backend: input.context.backend,
      cwd: input.context.cwd,
      businessSession: input.context.snapshot.businessSession,
      controlSession: input.context.snapshot.controlSession,
      reconciler: input.reconciliation,
    },
  }, {
    model: startupOverride?.model ?? input.context.model,
    runtime: startupOverride,
  })

  return createAgentRuntime(agentConfig, async ({ agent, messages, signal }): Promise<AgentRuntimeCompletionResult> => {
    if (input.injectedResolver) {
      const text = await input.injectedResolver(input.context)
      return {
        content: normalizeGeneratedInput(text) ?? '',
        raw: {
          source: 'injected-resolver',
        },
      }
    }

    return resolveNextUserInputFromSecretaryRuntime(input.runtime, input.context, agent, messages, signal)
  }).runTurn({
    input: input.inputText,
    messages: [{
      role: 'user',
      source: 'user',
      content: input.inputText,
      metadata: {
        businessSession: input.context.snapshot.businessSession,
        controlSession: input.context.snapshot.controlSession,
        reconciler: input.reconciliation,
      },
    }],
    signal: combineAbortSignals(AbortSignal.timeout(15_000), input.signal),
    metadata: {
      reason: input.reason,
      backend: input.context.backend,
      attempt: input.attempt,
      reconciler: input.reconciliation,
    },
  })
}

function combineAbortSignals(signal: AbortSignal, extraSignal?: AbortSignal): AbortSignal {
  if (!extraSignal) {
    return signal
  }

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, extraSignal])
  }

  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal.aborted || extraSignal.aborted) {
    abort()
    return controller.signal
  }

  signal.addEventListener('abort', abort, { once: true })
  extraSignal.addEventListener('abort', abort, { once: true })
  return controller.signal
}

async function resolveNextUserInputFromSecretaryRuntime(
  runtime: any,
  context: SecretaryAutoInputContext,
  agent: AgentRuntimeConfig,
  messages: AgentRuntimeMessage[],
  signal?: AbortSignal,
): Promise<AgentRuntimeCompletionResult> {
  const backend = normalizeString(agent.runtime?.backend) ?? 'linx'
  if (backend !== 'linx') {
    throw new SecretaryAutoInputBlockedError(`Secretary runtime backend ${backend} is not supported yet.`)
  }

  const session = await resolveSecretaryPodDataSession(runtime)
  if (!session) {
    throw new SecretaryAutoInputBlockedError('LinX login is required before Secretary can drive auto input.')
  }

  const target = resolveRuntimeTarget({ issuerUrl: session.credentials.url })
  const model = normalizeString(agent.runtime?.model) ?? agent.model
  const result = await createRemoteCompletionResult({
    runtimeUrl: target.runtimeUrl,
    authFetch: session.runtimeFetch,
    model,
    messages,
    signal,
  })

  return {
    content: result.content,
    reasoningContent: result.reasoningContent,
    finishReason: result.finishReason,
    usage: result.usage ? { ...result.usage } : undefined,
    raw: result,
  }
}

async function resolveSecretaryPodDataSession(runtime: any): Promise<PodDataSession | null> {
  const runtimeSessionGetter = runtime?.getPodDataSession
  if (typeof runtimeSessionGetter === 'function') {
    return runtimeSessionGetter.call(runtime)
  }

  return getDefaultPodDataSession()
}

function resolveAgentRuntimeStartupOverride(runtime: any): Partial<AgentRuntimeBackendConfig> | undefined {
  const candidates = [
    runtime?.agentRuntimeConfig,
    runtime?.agentRuntime,
  ]
  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue
    }
    const resolved = normalizeAgentRuntimeBackendConfig(candidate)
    if (resolved) {
      return resolved
    }
  }
  return undefined
}

function normalizeAgentRuntimeBackendConfig(value: Record<string, unknown>): Partial<AgentRuntimeBackendConfig> | undefined {
  const backend = normalizeString(value.backend)
  const model = normalizeString(value.model)
  const credentialSource = normalizeString(value.credentialSource)
  const runtime = normalizeString(value.runtime)
  const transport = normalizeString(value.transport)
  const endpoint = normalizeString(value.endpoint)
  const metadata = isRecord(value.metadata) ? { ...value.metadata } : undefined
  const resolved: Partial<AgentRuntimeBackendConfig> = {
    ...(backend ? { backend } : {}),
    ...(model ? { model } : {}),
    ...(credentialSource ? { credentialSource } : {}),
    ...(runtime ? { runtime } : {}),
    ...(transport ? { transport } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(metadata ? { metadata } : {}),
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined
}

function renderSecretaryAutoInputContext(context: SecretaryAutoInputContext): string {
  return [
    `Backend: ${context.backend ?? 'unknown'}`,
    `Workspace: ${context.cwd}`,
    context.model ? `Model: ${context.model}` : null,
    `Goal mode: ${context.goalMode ? 'on' : 'off'}`,
    context.goalMode && context.supervisorIntervalMs
      ? `Supervisor interval: ${context.supervisorIntervalMs}ms`
      : null,
    '',
    'Recent visible conversation:',
    ...context.recentMessages.map((message) => `[${message.role}] ${message.text}`),
    '',
    context.goalMode
      ? 'Write the next supervisor steer only when useful. Return empty if no intervention is needed.'
      : 'Write the next user input only.',
  ].filter((line): line is string => line !== null).join('\n')
}

function renderSecretaryAutoInputRetryContext(inputText: string): string {
  return [
    SECRETARY_RETRY_PREFIX,
    '',
    inputText,
  ].join('\n')
}

function resolveRecentMessages(interactive: any): Array<{ role: string; text: string }> {
  const fromEntries = resolveRecentMessagesFromEntries(getLinxActiveSessionHistoryEntries({ interactive }))
  if (fromEntries.length > 0) {
    return fromEntries
  }

  return resolveRecentMessagesFromAgentState(getLinxActiveSessionAgentMessages({ interactive }))
}

function resolveRecentMessagesFromEntries(entries: unknown): Array<{ role: string; text: string }> {
  if (!Array.isArray(entries)) {
    return []
  }

  return entries
    .filter((entry): entry is { type: string; message?: unknown } => isRecord(entry) && entry.type === 'message')
    .map((entry) => normalizeMessage(entry.message))
    .filter((message): message is { role: string; text: string } => message !== null)
    .slice(-MAX_CONTEXT_MESSAGES)
}

function resolveRecentMessagesFromAgentState(messages: unknown): Array<{ role: string; text: string }> {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages
    .map((message) => normalizeMessage(message))
    .filter((message): message is { role: string; text: string } => message !== null)
    .slice(-MAX_CONTEXT_MESSAGES)
}

function normalizeMessage(message: unknown): { role: string; text: string } | null {
  if (!isRecord(message)) {
    return null
  }

  const role = normalizeString(message.role)
  if (role !== 'user' && role !== 'assistant' && role !== 'system') {
    return null
  }

  const text = clipText(extractTextContent(message.content), MAX_CONTEXT_CHARS)
  return text ? { role, text } : null
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((part) => isRecord(part) && part.type === 'text' && typeof part.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
}

async function deliverAsUserInput(interactive: any, text: string): Promise<void> {
  await submitLinxInteractiveSessionUserInput(interactive, text, {
    unavailableMessage: 'Active LinX session cannot accept user input projection',
  })
}

type ProjectedInputDelivery = 'control-command' | 'peer-command' | 'backend'

async function deliverProjectedInput(interactive: any, text: string): Promise<ProjectedInputDelivery> {
  if (text.trim().startsWith('/')) {
    const handled = await handleLinxInteractiveProjectedCommand(interactive, text)
    if (handled === 'peer-command') {
      return 'peer-command'
    }
    if (handled === true) {
      return 'control-command'
    }
  }

  await deliverAsUserInput(interactive, text)
  return 'backend'
}

function projectedDeliveryTargetRole(delivery: ProjectedInputDelivery): 'control-command' | 'peer-command' | 'user' {
  if (delivery === 'backend') {
    return 'user'
  }
  return delivery
}

function normalizeGeneratedInput(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const text = clipText(stripWrappingFence(value.trim()), MAX_GENERATED_INPUT_CHARS)
  return text.length > 0 ? text : null
}

class SecretaryAutoInputBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecretaryAutoInputBlockedError'
  }
}

function isRecoverableAutoInputFailure(message: string, error?: unknown): boolean {
  if (error instanceof SecretaryAutoInputBlockedError || isRemoteAuthExpiredError(error)) {
    return false
  }

  const normalized = message.toLowerCase()
  if (
    normalized.includes('login is required')
    || normalized.includes('login expired')
    || normalized.includes('credential')
    || normalized.includes('unauthorized')
    || normalized.includes('permission')
    || normalized.includes('missing authority')
  ) {
    return false
  }

  return true
}

function isTransientRemoteAutoInputFailure(message: string, error?: unknown): boolean {
  const status = resolveTransientRemoteFailureStatus(error)
  if (status !== null) {
    return true
  }

  const normalized = message.toLowerCase()
  return normalized.includes('linx cloud is temporarily unavailable')
    || (normalized.includes('502') && normalized.includes('bad gateway'))
    || (normalized.includes('503') && normalized.includes('service unavailable'))
    || (normalized.includes('504') && normalized.includes('gateway timeout'))
}

function resolveTransientRemoteFailureStatus(error: unknown): number | null {
  if (typeof error === 'object' && error !== null) {
    const candidates = [
      (error as { status?: unknown }).status,
      (error as { response?: { status?: unknown } }).response?.status,
      (error as { cause?: { status?: unknown } }).cause?.status,
    ]

    for (const candidate of candidates) {
      if (candidate === 502 || candidate === 503 || candidate === 504) {
        return candidate
      }
    }
  }

  return null
}

function resolveAutoInputRecoveryDelaysMs(): number[] {
  return parsePositiveIntegerListEnv('LINX_AUTO_INPUT_RECOVERY_DELAYS_MS')
    ?? [...DEFAULT_AUTO_INPUT_RECOVERY_DELAYS_MS]
}

function resolveTransientRemoteRecoveryDelayMs(): number {
  return parsePositiveIntegerEnv('LINX_AUTO_INPUT_TRANSIENT_RECOVERY_DELAY_MS')
    ?? DEFAULT_TRANSIENT_REMOTE_RECOVERY_DELAY_MS
}

function parsePositiveIntegerListEnv(name: string): number[] | null {
  const raw = process.env[name]
  if (!raw) {
    return null
  }
  const values = raw.split(',').map((part) => Number(part.trim()))
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return null
  }
  return values.map((value) => Math.trunc(value))
}

function parsePositiveIntegerEnv(name: string): number | null {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null
}

function formatDelay(delayMs: number): string {
  if (delayMs < 1_000) {
    return `${delayMs}ms`
  }
  const seconds = delayMs / 1_000
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`
}

function resolveAssistantSignature(context: SecretaryAutoInputContext): string | null {
  const latest = context.recentMessages.at(-1)
  return latest?.role === 'assistant' ? createAssistantSignature(latest.text) : null
}

function createAssistantSignature(text: string): string | null {
  const normalized = text.trim()
  return normalized ? normalized.slice(-512) : null
}

function stripWrappingFence(value: string): string {
  const match = value.match(/^```(?:text|markdown|md)?\s*\n([\s\S]*?)\n```$/i)
  return match?.[1]?.trim() ?? value
}

function clipText(value: string, maxChars: number): string {
  return value.length > maxChars ? value.slice(0, maxChars) : value
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function summarizeRuntimeRun(run: {
  id: string
  agent: string
  role: string
  model: string
  trigger?: string
  status: string
  startedAt: string
  completedAt?: string
}): Record<string, unknown> {
  return {
    id: run.id,
    agent: run.agent,
    role: run.role,
    model: run.model,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  }
}

function summarizeRuntimeSteps(steps: Array<{
  id: string
  stepType: string
  message?: string
  createdAt: string
}>): Array<Record<string, unknown>> {
  return steps.map((step) => ({
    id: step.id,
    stepType: step.stepType,
    message: step.message,
    createdAt: step.createdAt,
  }))
}

function isAgentRuntimeTurnError(error: unknown): error is {
  run: Parameters<typeof summarizeRuntimeRun>[0]
  steps: Parameters<typeof summarizeRuntimeSteps>[0]
} {
  return isRecord(error)
    && isRecord(error.run)
    && Array.isArray(error.steps)
}
