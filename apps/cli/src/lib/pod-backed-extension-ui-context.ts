import { randomUUID } from 'node:crypto'
import type { ExtensionUIDialogOptions, ExtensionUIContext } from '@earendil-works/pi-coding-agent'
import type {
  AutoModeApprovalDecision,
  AutoModeApprovalOption,
  AutoModeInteractionRequest,
  AutoModeUserInputQuestion,
} from '@linx/agent-runtime/auto-mode'
import {
  createRemoteApproval,
  resolveRemoteAutoModeApproval,
  waitForRemoteAutoModeApproval,
  type AutoModeRemoteApprovalRuntime,
  type RemoteApprovalRequestDetails,
  type RemoteApprovalSubjectContext,
} from './auto-mode/pod-approval.js'
import { DEFAULT_SECRETARY_CHAT_ID, secretaryAgentUri, secretaryThreadUri } from './pod-mirror-mapping.js'
import type { SessionControlManager } from './session-control.js'

const EXTENSION_UI_POLICY_VERSION = 'linx-pi-extension-ui/v1'
const DEFAULT_POLL_MS = 1000
const EXTENSION_UI_INPUT_QUESTION_ID = 'runtime'

export interface PodBackedExtensionUiOptions {
  cwd?: string
  sessionId?: string | (() => string | undefined)
  pollMs?: number
  runtime?: AutoModeRemoteApprovalRuntime
  sessionControl?: SessionControlManager
  onWarning?: (error: unknown) => void
}

export function createPodBackedExtensionUiContext<T extends ExtensionUIContext>(
  baseUi: T,
  options: PodBackedExtensionUiOptions = {},
): T {
  return {
    ...baseUi,
    select(title, choices, opts) {
      return selectWithPodApproval(baseUi, title, choices, opts, options)
    },
    confirm(title, message, opts) {
      return confirmWithPodApproval(baseUi, title, message, opts, options)
    },
    input(title, placeholder, opts) {
      return inputWithAutoSecretary(baseUi, title, placeholder, opts, options)
    },
  }
}

async function selectWithPodApproval(
  baseUi: Pick<ExtensionUIContext, 'select'>,
  title: string,
  choices: string[],
  opts: ExtensionUIDialogOptions | undefined,
  options: PodBackedExtensionUiOptions,
): Promise<string | undefined> {
  if (opts?.signal?.aborted || choices.length === 0) {
    return baseUi.select(title, choices, opts)
  }
  if (!shouldPodBackSelect(choices)) {
    return baseUi.select(title, choices, opts)
  }

  const approvalOptions = choices.map((label, index) => buildSelectApprovalOption(label, index))
  const autoResult = await resolveAutoSecretaryExtensionUiInput({
    title,
    kind: 'select',
    choices,
    approvalOptions,
    timeoutMs: opts?.timeout,
    options,
    mapResponse: (response) => {
      if (!response) {
        return undefined
      }
      if (response.kind === 'approval') {
        return choiceFromRemoteDecision(response.decision, choices, approvalOptions)
      }
      const answer = response.answers[EXTENSION_UI_INPUT_QUESTION_ID]?.answers[0]
      if (!answer) {
        return undefined
      }
      return choices.includes(answer) ? answer : undefined
    },
  })
  if (autoResult.resolved) {
    return autoResult.value
  }

  const result = await raceLocalAndRemote({
    title,
    kind: 'select',
    choices,
    approvalOptions,
    opts,
    options,
    runLocal: (signal) => baseUi.select(title, choices, { ...opts, signal }),
    mapLocalToDecision: (selected) => podDecisionFromSelectedChoice(selected, approvalOptions),
    mapRemoteToLocal: (decision) => choiceFromRemoteDecision(decision, choices, approvalOptions),
    localResolutionNote: (selected) => selected
      ? encodeExtensionUiNote({ kind: 'select', selectedOptionId: optionIdForChoice(selected, choices), selectedLabel: selected })
      : encodeExtensionUiNote({ kind: 'select', cancelled: true }),
  })

  return result
}

async function confirmWithPodApproval(
  baseUi: Pick<ExtensionUIContext, 'confirm'>,
  title: string,
  message: string,
  opts: ExtensionUIDialogOptions | undefined,
  options: PodBackedExtensionUiOptions,
): Promise<boolean> {
  if (opts?.signal?.aborted) {
    return baseUi.confirm(title, message, opts)
  }

  const approvalOptions: AutoModeApprovalOption[] = [
    { optionId: 'yes', label: 'Yes', kind: 'allow_once' },
    { optionId: 'no', label: 'No', kind: 'reject_once' },
  ]
  const autoResult = await resolveAutoSecretaryExtensionUiInput({
    title,
    message,
    kind: 'confirm',
    choices: ['Yes', 'No'],
    approvalOptions,
    timeoutMs: opts?.timeout,
    options,
    mapResponse: (response) => {
      if (!response) {
        return undefined
      }
      if (response.kind === 'approval') {
        return response.decision === 'accept' || response.decision === 'accept_for_session'
      }
      const answer = response.answers[EXTENSION_UI_INPUT_QUESTION_ID]?.answers[0]?.toLowerCase()
      if (!answer) {
        return undefined
      }
      if (['yes', 'y', 'true', 'allow', 'approve', 'confirm'].includes(answer)) {
        return true
      }
      if (['no', 'n', 'false', 'deny', 'decline', 'reject'].includes(answer)) {
        return false
      }
      return undefined
    },
  })
  if (autoResult.resolved) {
    return autoResult.value ?? false
  }

  const result = await raceLocalAndRemote({
    title,
    message,
    kind: 'confirm',
    choices: ['Yes', 'No'],
    approvalOptions,
    opts,
    options,
    runLocal: (signal) => baseUi.confirm(title, message, { ...opts, signal }),
    mapLocalToDecision: (confirmed) => confirmed ? 'accept' : 'decline',
    mapRemoteToLocal: (decision) => decision === 'accept' || decision === 'accept_for_session',
    localResolutionNote: (confirmed) => encodeExtensionUiNote({
      kind: 'confirm',
      selectedOptionId: confirmed ? 'yes' : 'no',
      selectedLabel: confirmed ? 'Yes' : 'No',
    }),
  })

  return result ?? false
}

async function inputWithAutoSecretary(
  baseUi: Pick<ExtensionUIContext, 'input'>,
  title: string,
  placeholder: string | undefined,
  opts: ExtensionUIDialogOptions | undefined,
  options: PodBackedExtensionUiOptions,
): Promise<string | undefined> {
  if (opts?.signal?.aborted) {
    return baseUi.input(title, placeholder, opts)
  }

  const autoResult = await resolveAutoSecretaryExtensionUiInput({
    title,
    message: placeholder,
    kind: 'input',
    choices: [],
    approvalOptions: [],
    timeoutMs: opts?.timeout,
    options,
    mapResponse: (response) => {
      if (!response) {
        return undefined
      }
      if (response.kind !== 'user-input') {
        return undefined
      }
      return response.answers[EXTENSION_UI_INPUT_QUESTION_ID]?.answers[0]
    },
  })
  if (autoResult.resolved) {
    return autoResult.value
  }

  return baseUi.input(title, placeholder, opts)
}

async function resolveAutoSecretaryExtensionUiInput<T>(input: {
  title: string
  message?: string
  kind: 'select' | 'confirm' | 'input'
  choices: string[]
  approvalOptions: AutoModeApprovalOption[]
  timeoutMs?: number
  options: PodBackedExtensionUiOptions
  mapResponse: (response: Awaited<ReturnType<SessionControlManager['resolveInteractionRequest']>>) => T | undefined
}): Promise<{ resolved: true; value: T | undefined } | { resolved: false }> {
  const sessionControl = input.options.sessionControl
  if (!sessionControl) {
    return { resolved: false }
  }

  const request = buildExtensionUiInteractionRequest(input)
  const response = await sessionControl.resolveInteractionRequest({ request })
  if (!response) {
    return { resolved: false }
  }

  const value = input.mapResponse(response)
  return value === undefined ? { resolved: false } : { resolved: true, value }
}

function buildExtensionUiInteractionRequest(input: {
  title: string
  message?: string
  kind: 'select' | 'confirm' | 'input'
  choices: string[]
  approvalOptions: AutoModeApprovalOption[]
  timeoutMs?: number
  options: PodBackedExtensionUiOptions
}): AutoModeInteractionRequest {
  if (input.kind === 'input' || input.approvalOptions.length === 0) {
    return {
      kind: 'user-input',
      message: [input.title, input.message].filter(Boolean).join('\n') || 'Input required',
      questions: [buildExtensionUiQuestion(input)],
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      raw: buildExtensionUiRaw(input),
    }
  }

  return {
    kind: 'codex-approval',
    message: [input.title, input.message].filter(Boolean).join('\n') || 'Approval required',
    approvalOptions: input.approvalOptions,
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    raw: buildExtensionUiRaw(input),
  }
}

function buildExtensionUiQuestion(input: {
  title: string
  message?: string
  kind: 'select' | 'confirm' | 'input'
  choices: string[]
}): AutoModeUserInputQuestion {
  return {
    id: EXTENSION_UI_INPUT_QUESTION_ID,
    header: input.kind === 'input' ? 'Input' : 'Select',
    question: [input.title, input.message].filter(Boolean).join('\n') || 'Input required',
    options: input.choices.map((label) => ({ label })),
  }
}

function buildExtensionUiRaw(input: {
  title: string
  message?: string
  kind: 'select' | 'confirm' | 'input'
  choices: string[]
  options: PodBackedExtensionUiOptions
}): Record<string, unknown> {
  return {
    source: 'pi-extension-ui',
    kind: input.kind,
    title: input.title,
    ...(input.message ? { message: input.message } : {}),
    choices: input.choices,
    ...(input.options.cwd ? { cwd: input.options.cwd } : {}),
    sessionId: resolveSessionId(input.options.sessionId),
  }
}

async function raceLocalAndRemote<TLocal>(input: {
  title: string
  message?: string
  kind: 'select' | 'confirm'
  choices: string[]
  approvalOptions: AutoModeApprovalOption[]
  opts?: ExtensionUIDialogOptions
  options: PodBackedExtensionUiOptions
  runLocal: (signal: AbortSignal) => Promise<TLocal>
  mapLocalToDecision: (value: TLocal) => AutoModeApprovalDecision
  mapRemoteToLocal: (decision: AutoModeApprovalDecision) => TLocal
  localResolutionNote: (value: TLocal) => string
}): Promise<TLocal> {
  const localAbort = new AbortController()
  const removeInputAbort = linkAbortSignal(input.opts?.signal, () => localAbort.abort())
  const remoteAbort = new AbortController()
  const removeRemoteAbort = linkAbortSignal(input.opts?.signal, () => remoteAbort.abort())
  const localPromise = input.runLocal(localAbort.signal).then((value) => ({
    source: 'local' as const,
    value,
  }))
  const remoteReadyPromise = createExtensionUiRemoteApproval({
    title: input.title,
    message: input.message,
    kind: input.kind,
    choices: input.choices,
    approvalOptions: input.approvalOptions,
    timeoutMs: input.opts?.timeout,
    options: input.options,
  }).catch((error) => {
    input.options.onWarning?.(error)
    return null
  })
  const remotePromise = remoteReadyPromise.then(async (remote) => {
    if (!remote) {
      return { source: 'remote-unavailable' as const }
    }
    const decision = await waitForRemoteAutoModeApproval({
      approvalId: remote.id,
      approvalUri: remote.approvalUri,
      pollMs: input.options.pollMs ?? DEFAULT_POLL_MS,
      signal: remoteAbort.signal,
      runtime: input.options.runtime,
    })
    return {
      source: 'remote' as const,
      value: input.mapRemoteToLocal(decision),
    }
  })

  void localPromise.catch(() => undefined)
  void remotePromise.catch(() => undefined)

  try {
    const winner = await Promise.race([localPromise, remotePromise])
    if (winner.source === 'remote-unavailable') {
      return (await localPromise).value
    }

    if (winner.source === 'local') {
      remoteAbort.abort()
      void remoteReadyPromise.then((remote) => {
        if (!remote) {
          return undefined
        }
        return resolveRemoteAutoModeApproval({
          approvalId: remote.id,
          approvalUri: remote.approvalUri,
          decision: input.mapLocalToDecision(winner.value),
          decisionRole: 'human',
          note: input.localResolutionNote(winner.value),
          runtime: input.options.runtime,
        })
      }).catch((error) => input.options.onWarning?.(error))
      return winner.value
    }

    localAbort.abort()
    return winner.value
  } finally {
    removeInputAbort()
    removeRemoteAbort()
  }
}

async function createExtensionUiRemoteApproval(input: {
  title: string
  message?: string
  kind: 'select' | 'confirm'
  choices: string[]
  approvalOptions: AutoModeApprovalOption[]
  timeoutMs?: number
  options: PodBackedExtensionUiOptions
}): Promise<Awaited<ReturnType<typeof createRemoteApproval>>> {
  return createRemoteApproval({
    subject: ({ webId }) => buildExtensionUiApprovalSubject(webId, input.options),
    request: ({ sessionUri }) => buildExtensionUiApprovalRequest({
      title: input.title,
      message: input.message,
      kind: input.kind,
      choices: input.choices,
      approvalOptions: input.approvalOptions,
      sessionUri,
      cwd: input.options.cwd,
      timeoutMs: input.timeoutMs,
    }),
    runtime: input.options.runtime,
  })
}

function buildExtensionUiApprovalSubject(webId: string, options: PodBackedExtensionUiOptions): RemoteApprovalSubjectContext {
  const sessionId = resolveSessionId(options.sessionId) ?? 'linx-pi-extension-ui'
  const sessionUri = secretaryThreadUri(webId, sessionId, DEFAULT_SECRETARY_CHAT_ID)
  return {
    sessionUri,
    actorUri: secretaryAgentUri(webId),
    target: sessionUri,
    policyVersion: EXTENSION_UI_POLICY_VERSION,
  }
}

function buildExtensionUiApprovalRequest(input: {
  title: string
  message?: string
  kind: 'select' | 'confirm'
  choices: string[]
  approvalOptions: AutoModeApprovalOption[]
  sessionUri: string
  cwd?: string
  timeoutMs?: number
}): RemoteApprovalRequestDetails {
  const prompt = [input.title, input.message].filter(Boolean).join('\n')
  return {
    kind: 'codex-approval',
    message: prompt,
    toolCallId: `extension-ui-${input.kind}-${randomUUID()}`,
    toolName: `extension-ui-${input.kind}`,
    action: 'https://undefineds.co/ns#runtimeApproval',
    risk: 'medium',
    approvalOptions: input.approvalOptions,
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    context: JSON.stringify({
      source: 'pi-extension-ui',
      kind: input.kind,
      title: input.title,
      ...(input.message ? { message: input.message } : {}),
      choices: input.choices,
      ...(input.cwd ? { cwd: input.cwd } : {}),
    }),
    entry: input.sessionUri,
  }
}

function shouldPodBackSelect(choices: string[]): boolean {
  const inferred = choices.map((choice) => inferApprovalOptionKind(choice))
  const hasAllow = inferred.some((kind) => kind === 'allow_once' || kind === 'allow_always')
  const hasReject = inferred.some((kind) => kind === 'reject_once' || kind === 'reject_always' || kind === 'cancel')
  return hasAllow && hasReject
}

function buildSelectApprovalOption(label: string, index: number): AutoModeApprovalOption {
  const kind = inferApprovalOptionKind(label)
  return {
    optionId: String(index),
    label,
    ...(kind ? { kind } : {}),
  }
}

function inferApprovalOptionKind(label: string): AutoModeApprovalOption['kind'] | undefined {
  const normalized = label.toLowerCase()
  if (/\b(always|session|trust)\b/u.test(normalized)) {
    return 'allow_always'
  }
  if (/\b(allow|approve|yes|ok|confirm|proceed|continue)\b/u.test(normalized)) {
    return 'allow_once'
  }
  if (/\b(cancel|escape)\b/u.test(normalized)) {
    return 'cancel'
  }
  if (/\b(block|deny|decline|reject|no)\b/u.test(normalized)) {
    return 'reject_once'
  }
  return undefined
}

function decisionFromSelectedChoice(
  selected: string | undefined,
  approvalOptions: AutoModeApprovalOption[],
): AutoModeApprovalDecision {
  if (!selected) {
    return 'cancel'
  }

  const option = approvalOptions.find((entry) => entry.label === selected)
  if (option?.kind === 'allow_always') {
    return 'accept_for_session'
  }
  if (option?.kind === 'reject_once' || option?.kind === 'reject_always') {
    return 'decline'
  }
  if (option?.kind === 'cancel') {
    return 'cancel'
  }
  return 'accept'
}

function podDecisionFromSelectedChoice(
  selected: string | undefined,
  approvalOptions: AutoModeApprovalOption[],
): AutoModeApprovalDecision {
  const decision = decisionFromSelectedChoice(selected, approvalOptions)
  // Extension UI options belong to the extension, not LinX's reusable grant
  // layer. Preserve the exact option in the note without creating a grant.
  return decision === 'accept_for_session' ? 'accept' : decision
}

function choiceFromRemoteDecision(
  decision: AutoModeApprovalDecision,
  choices: string[],
  approvalOptions: AutoModeApprovalOption[],
): string | undefined {
  if (decision === 'cancel') {
    return undefined
  }

  const preferredKinds = decision === 'accept_for_session'
    ? ['allow_always', 'allow_once']
    : decision === 'accept'
      ? ['allow_once', 'allow_always']
      : ['reject_once', 'reject_always', 'cancel']

  for (const kind of preferredKinds) {
    const option = approvalOptions.find((entry) => entry.kind === kind)
    if (option) {
      return choices[Number(option.optionId)] ?? option.label
    }
  }

  if (decision === 'decline') {
    return undefined
  }

  return choices[0]
}

function optionIdForChoice(selected: string, choices: string[]): string | undefined {
  const index = choices.findIndex((choice) => choice === selected)
  return index >= 0 ? String(index) : undefined
}

function encodeExtensionUiNote(value: Record<string, unknown>): string {
  return JSON.stringify({
    source: 'pi-extension-ui',
    ...value,
  })
}

function resolveSessionId(value: PodBackedExtensionUiOptions['sessionId']): string | undefined {
  const resolved = typeof value === 'function' ? value() : value
  return typeof resolved === 'string' && resolved.trim() ? resolved.trim() : undefined
}

function linkAbortSignal(signal: AbortSignal | undefined, onAbort: () => void): () => void {
  if (!signal) {
    return () => undefined
  }
  if (signal.aborted) {
    onAbort()
    return () => undefined
  }
  signal.addEventListener('abort', onAbort, { once: true })
  return () => signal.removeEventListener('abort', onAbort)
}
