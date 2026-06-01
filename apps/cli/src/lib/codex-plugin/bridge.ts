import {
  buildCodexApprovalResponse,
  buildCodexUserInputResponse,
  normalizeCodexAppServerInteractionRequest,
  type AutoModeApprovalDecision,
  type AutoModeApprovalRequest,
  type AutoModeInteractionRequest,
  type AutoModeSecretaryRecommendation,
  type AutoModeSessionRecord,
} from '@linx/agent-runtime/auto-mode'
import { runThreadReconcilerCycle, type ThreadControlEvent } from '@linx/agent-runtime'
import { appendAutoModeEvent, createAutoModeSession, writeAutoModeSession } from '../auto-mode/archive.js'
import {
  createRemoteAutoModeApproval,
  materializeRemoteAutoModeGrant,
  waitForRemoteAutoModeApproval,
} from '../auto-mode/pod-approval.js'
import type { AutoRunOptions, AutoModeSpawnPlan } from '../auto-mode/types.js'
import type { SessionControlManager } from '../pi-adapter/session-control.js'

export interface CodexAttachBridgeRuntime {
  createRemoteAutoModeApproval: typeof createRemoteAutoModeApproval
  waitForRemoteAutoModeApproval: typeof waitForRemoteAutoModeApproval
  materializeRemoteAutoModeGrant?: typeof materializeRemoteAutoModeGrant
  sessionControl?: SessionControlManager
  resolveAutoModeSecretaryRecommendation?: (input: {
    mode: 'auto' | 'off'
    record: AutoModeSessionRecord
    request: AutoModeInteractionRequest
  }) => Promise<AutoModeSecretaryRecommendation | null>
}

export interface CodexAttachDecisionResult {
  request: AutoModeInteractionRequest
  decision: AutoModeApprovalDecision
  response: unknown
  reconciler?: unknown
}

export interface CodexAttachBridgeResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: {
    code: number
    message: string
  }
}

export interface CodexAttachBridge {
  readonly record: AutoModeSessionRecord
  setSessionControl(control: SessionControlManager): void
  handleCodexRequest(message: Record<string, unknown>): Promise<CodexAttachDecisionResult | null>
  handleCodexRpcLine(line: string): Promise<CodexAttachBridgeResponse[]>
}

const defaultPlan: AutoModeSpawnPlan = {
  command: 'codex',
  args: [],
}

function isSecretaryControlEnabled(record: AutoModeSessionRecord): boolean {
  return record.autoEnabled ?? record.mode === 'auto'
}

export function resolveCodexAttachWorkspacePath(input: {
  workspacePath?: string
  cwd?: string
}): string {
  const workspacePath = input.workspacePath?.trim()
  if (workspacePath) {
    return workspacePath
  }

  const cwd = input.cwd?.trim()
  if (cwd) {
    return cwd
  }

  throw new Error('Codex attach requires a workspace path')
}

export function createCodexAttachSessionRecord(input: {
  workspacePath?: string
  cwd?: string
  backendSessionId: string
  model?: string
  prompt?: string
}): AutoModeSessionRecord {
  const workspacePath = resolveCodexAttachWorkspacePath(input)
  const options: AutoRunOptions = {
    backend: 'codex',
    autoEnabled: false,
    cwd: workspacePath,
    model: input.model,
    prompt: input.prompt,
    passthroughArgs: [],
    runtime: 'local',
    transport: 'acp',
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
  }

  const record = createAutoModeSession(options, defaultPlan)
  record.backendSessionId = input.backendSessionId
  writeAutoModeSession(record)
  return record
}

export function createCodexAttachBridge(
  record: AutoModeSessionRecord,
  runtime: CodexAttachBridgeRuntime = {
    createRemoteAutoModeApproval,
    waitForRemoteAutoModeApproval,
    materializeRemoteAutoModeGrant,
  },
): CodexAttachBridge {
  const activeRuntime = runtime
  return {
    record,
    setSessionControl(control: SessionControlManager): void {
      activeRuntime.sessionControl = control
    },
    async handleCodexRequest(message: Record<string, unknown>): Promise<CodexAttachDecisionResult | null> {
      const interaction = normalizeCodexAppServerInteractionRequest(message)
      if (!interaction || interaction.kind === 'codex-approval') {
        return null
      }

      const secretaryResponse = isSecretaryControlEnabled(record)
        ? await activeRuntime.sessionControl?.resolveInteractionRequest({ request: interaction, record })
        : null
      if (secretaryResponse) {
        if (secretaryResponse.kind === 'user-input') {
          return {
            request: interaction,
            decision: 'accept',
            response: buildCodexUserInputResponse(secretaryResponse.answers),
          }
        }

        return {
          request: secretaryResponse.request,
          decision: secretaryResponse.decision,
          response: buildCodexApprovalResponse(secretaryResponse.request, secretaryResponse.decision),
        }
      }

      return resolveCodexAttachInteractionThroughReconciler(record, interaction, activeRuntime)
    },
    async handleCodexRpcLine(line: string): Promise<CodexAttachBridgeResponse[]> {
      const trimmed = line.trim()
      if (!trimmed) {
        return []
      }

      let message: Record<string, unknown>
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return []
        }
        message = parsed as Record<string, unknown>
      } catch {
        return []
      }

      if (typeof message.method !== 'string' || !('id' in message)) {
        return []
      }

      try {
        const result = await this.handleCodexRequest(message)
        if (!result) {
          return []
        }

        return [{
          jsonrpc: '2.0',
          id: message.id as string | number,
          result: result.response,
        }]
      } catch (error) {
        return [{
          jsonrpc: '2.0',
          id: message.id as string | number,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : String(error),
          },
        }]
      }
    },
  }
}

async function resolveCodexAttachInteractionThroughReconciler(
  record: AutoModeSessionRecord,
  interaction: AutoModeInteractionRequest,
  runtime: CodexAttachBridgeRuntime,
): Promise<CodexAttachDecisionResult | null> {
  let result: CodexAttachDecisionResult | null = null
  let wakeError: unknown
  const secretaryControlEnabled = isSecretaryControlEnabled(record)
  const cycle = await runThreadReconcilerCycle({
    policy: {
      kind: secretaryControlEnabled ? 'auto' : 'direct',
      secretaryAgent: 'ai-secretary',
    },
    handleWakeJob: async ({ decisionSummary, record: wakeRecord }) => {
      try {
        const secretary = await runtime.resolveAutoModeSecretaryRecommendation?.({
          mode: record.mode === 'auto' ? 'auto' : 'off',
          record,
          request: interaction,
        })
        result = buildSecretaryAttachDecision(interaction, secretary, decisionSummary)
        return {
          requestKind: interaction.kind,
          responseKind: result?.decision,
          reconciler: decisionSummary.id,
          wakeJob: wakeRecord.key,
        }
      } catch (error) {
        wakeError = error
        throw error
      }
    },
    event: createCodexAttachInteractionThreadEvent(record, interaction),
    dispatchOptions: {
      randomId: `codex-attach-${interaction.kind}-${Date.now()}`,
    },
    onDispatched: (dispatch) => {
      appendCodexAttachSessionNote(record, `Thread Reconciler dispatched ${interaction.kind}`, {
        requestKind: interaction.kind,
        reconciler: dispatch.summary,
        scheduler: {
          wakeRecords: dispatch.wakeRecordSummaries,
        },
      })
    },
  })

  if (cycle.schedulerSummary.failed.length > 0) {
    throw wakeError ?? new Error(String(cycle.schedulerSummary.failed[0]?.error ?? 'Codex attach interaction wake job failed'))
  }
  if (!result && interaction.kind !== 'user-input') {
    result = await resolveCodexAttachRemoteApproval(record, interaction, runtime, cycle.summary)
  }
  appendCodexAttachSessionNote(record, `Thread Reconciler resolved ${interaction.kind}`, {
    requestKind: interaction.kind,
    reconciler: cycle.summary,
    scheduler: cycle.schedulerSummary,
  })
  return result
}

function buildSecretaryAttachDecision(
  interaction: AutoModeInteractionRequest,
  secretary: AutoModeSecretaryRecommendation | null | undefined,
  reconciler: unknown,
): CodexAttachDecisionResult | null {
  if (secretary?.canAutoDecide !== true) {
    return null
  }

  if (interaction.kind === 'user-input' && secretary.kind === 'user-input' && secretary.answers) {
    return {
      request: interaction,
      decision: 'accept',
      response: buildCodexUserInputResponse(secretary.answers),
      reconciler,
    }
  }

  if (interaction.kind !== 'user-input' && secretary.kind !== 'user-input' && secretary.decision) {
    return {
      request: interaction,
      decision: secretary.decision,
      response: buildCodexApprovalResponse(interaction, secretary.decision),
      reconciler,
    }
  }

  return null
}

async function resolveCodexAttachRemoteApproval(
  record: AutoModeSessionRecord,
  interaction: AutoModeApprovalRequest,
  runtime: CodexAttachBridgeRuntime,
  reconciler: unknown,
): Promise<CodexAttachDecisionResult> {
  const remote = await runtime.createRemoteAutoModeApproval({
    record,
    request: interaction,
  })
  const decision = await runtime.waitForRemoteAutoModeApproval({
    approvalId: remote.id,
    approvalUri: remote.approvalUri,
  })
  if (decision === 'accept_for_session') {
    await runtime.materializeRemoteAutoModeGrant?.({
      approvalId: remote.id,
      approvalUri: remote.approvalUri,
    }).catch(() => undefined)
  }

  return {
    request: interaction,
    decision,
    response: buildCodexApprovalResponse(interaction, decision),
    reconciler,
  }
}

function createCodexAttachInteractionThreadEvent(
  record: AutoModeSessionRecord,
  interaction: AutoModeInteractionRequest,
): ThreadControlEvent {
  return {
    type: interaction.kind === 'user-input' ? 'input.required' : 'approval.required',
    thread: record.backendSessionId ?? record.id,
    chat: record.backendSessionId ?? record.id,
    actor: {
      id: record.backendSessionId ?? record.backend,
      role: 'runtime',
    },
    data: {
      requestKind: interaction.kind,
      backend: record.backend,
      runtimeSession: record.backendSessionId,
      businessSession: record.id,
    },
  }
}

function appendCodexAttachSessionNote(
  record: AutoModeSessionRecord,
  message: string,
  raw?: unknown,
): void {
  appendAutoModeEvent(record, {
    timestamp: new Date().toISOString(),
    stream: 'system',
    line: JSON.stringify({
      type: 'session.note',
      message,
    }),
    events: [{
      type: 'session.note',
      message,
      raw,
    }],
  })
}

export function isCodexAttachApprovalRequest(
  interaction: AutoModeInteractionRequest | null,
): interaction is AutoModeApprovalRequest {
  return Boolean(interaction && interaction.kind !== 'user-input')
}
