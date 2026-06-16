import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import { drizzle, solidResources, type SolidDatabase } from '../models.js'
import {
  persistObservedCapture,
  persistAmbiguousCapture,
  recordCaptureCommit,
  recordCaptureReviewEvent,
  requestCaptureApproval,
  type CapturePersistenceDatabase,
} from './persistence.js'

const CaptureOperation = {
  OBSERVED_CANDIDATE: 'observed_candidate',
  DIRECT_COMMIT_EVENT: 'direct_commit_event',
  OPTIMISTIC_COMMIT_EVENT: 'optimistic_commit_event',
  AMBIGUOUS_INPUT: 'ambiguous_input',
  APPROVAL_REQUEST: 'approval_request',
  REVIEW_EVENT: 'review_event',
} as const

type CaptureOperationType = typeof CaptureOperation[keyof typeof CaptureOperation]

type LinxCaptureToolDetails = {
  operation?: CaptureOperationType
  result?: unknown
  error?: string
}

type LinxCaptureToolResult = {
  content: Array<{ type: 'text'; text: string }>
  details: LinxCaptureToolDetails
  isError?: boolean
}

type LinxCaptureToolParams = {
  operation: CaptureOperationType
  id?: string
  eventId?: string
  source?: string
  summary?: string
  targetResource?: string
  suggestedType?: string
  suggestedTarget?: string
  confidence?: 'low' | 'medium' | 'high'
  reason?: string
  actor?: string
  chat?: string
  thread?: string
  task?: string
  run?: string
  sourceHash?: string
  metadata?: Record<string, unknown>
  createdAt?: string | number
  approval?: string
  inputRequest?: string
  inputRequestId?: string
  prompt?: string
  inputOptions?: string
  requestKind?: string
  requester?: string
  assignedTo?: string
  inputContext?: string
  approvalId?: string
  session?: string
  toolCallId?: string
  toolName?: string
  target?: string
  action?: string
  risk?: string
  approvalOptions?: string
  approvalContext?: string
  expiresAt?: string | number
  about?: string
  candidateId?: string
  candidateIri?: string
  decision?: 'promoted' | 'rejected' | 'corrected' | 'rollback' | 'ignored'
  userCorrection?: string
}

export interface LinxCapturePodSession {
  webId: string
  podUrl: string
  solidSession?: PodDataSession['solidSession']
}

export interface LinxCaptureToolDependencies {
  getPodDataSession?: () => Promise<LinxCapturePodSession | null>
  createDb?: (session: LinxCapturePodSession) => CapturePersistenceDatabase
}

export function createLinxCaptureTool(
  dependencies: LinxCaptureToolDependencies = {},
): ToolDefinition {
  const getPodDataSession = dependencies.getPodDataSession ?? getDefaultPodDataSession
  const createDb = dependencies.createDb ?? createDefaultCaptureDb

  return defineTool({
    name: 'linx_capture',
    label: 'LinX Capture',
    description: 'Persist LinX CaptureCandidate, CaptureEvent, ApprovalRequest, and InputRequest records to the active Solid Pod using shared LinX models.',
    promptSnippet: 'linx_capture: record Secretary capture candidates, capture events, and Approval/Input gates in the active Pod.',
    promptGuidelines: [
      'Use linx_capture for CaptureCandidate/CaptureEvent ledgers; use xpod obj for formal typed resource writes when the target resource itself must be created.',
      'Do not use linx_capture to silently create user-facing taxonomy; choose approval_request or ambiguous_input when authority or missing information is required.',
      'Always provide the source IRI or durable source URL for duplicate detection and auditability.',
    ],
    parameters: Type.Object({
      operation: Type.Union([
        Type.Literal(CaptureOperation.OBSERVED_CANDIDATE),
        Type.Literal(CaptureOperation.DIRECT_COMMIT_EVENT),
        Type.Literal(CaptureOperation.OPTIMISTIC_COMMIT_EVENT),
        Type.Literal(CaptureOperation.AMBIGUOUS_INPUT),
        Type.Literal(CaptureOperation.APPROVAL_REQUEST),
        Type.Literal(CaptureOperation.REVIEW_EVENT),
      ]),
      id: Type.Optional(Type.String()),
      eventId: Type.Optional(Type.String()),
      source: Type.Optional(Type.String()),
      summary: Type.Optional(Type.String()),
      targetResource: Type.Optional(Type.String()),
      suggestedType: Type.Optional(Type.String()),
      suggestedTarget: Type.Optional(Type.String()),
      confidence: Type.Optional(Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')])),
      reason: Type.Optional(Type.String()),
      actor: Type.Optional(Type.String()),
      chat: Type.Optional(Type.String()),
      thread: Type.Optional(Type.String()),
      task: Type.Optional(Type.String()),
      run: Type.Optional(Type.String()),
      sourceHash: Type.Optional(Type.String()),
      metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
      createdAt: Type.Optional(Type.Union([Type.String(), Type.Number()])),
      approval: Type.Optional(Type.String()),
      inputRequest: Type.Optional(Type.String()),
      inputRequestId: Type.Optional(Type.String()),
      prompt: Type.Optional(Type.String()),
      inputOptions: Type.Optional(Type.String()),
      requestKind: Type.Optional(Type.String()),
      requester: Type.Optional(Type.String()),
      assignedTo: Type.Optional(Type.String()),
      inputContext: Type.Optional(Type.String()),
      approvalId: Type.Optional(Type.String()),
      session: Type.Optional(Type.String()),
      toolCallId: Type.Optional(Type.String()),
      toolName: Type.Optional(Type.String()),
      target: Type.Optional(Type.String()),
      action: Type.Optional(Type.String()),
      risk: Type.Optional(Type.String()),
      approvalOptions: Type.Optional(Type.String()),
      approvalContext: Type.Optional(Type.String()),
      expiresAt: Type.Optional(Type.Union([Type.String(), Type.Number()])),
      about: Type.Optional(Type.String()),
      candidateId: Type.Optional(Type.String()),
      candidateIri: Type.Optional(Type.String()),
      decision: Type.Optional(Type.Union([
        Type.Literal('promoted'),
        Type.Literal('rejected'),
        Type.Literal('corrected'),
        Type.Literal('rollback'),
        Type.Literal('ignored'),
      ])),
      userCorrection: Type.Optional(Type.String()),
    }),
    async execute(toolCallId, rawParams) {
      const params = rawParams as LinxCaptureToolParams
      try {
        const session = await getPodDataSession()
        if (!session) {
          return errorResult('No active LinX Pod session. Run /login or linx login before recording capture data.')
        }

        const db = createDb(session)
        const result = await executeCaptureOperation({ db, webId: session.webId }, params, toolCallId)
        return okResult(params.operation, result)
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error))
      }
    },
  })
}

function createDefaultCaptureDb(session: LinxCapturePodSession): SolidDatabase {
  if (!session.solidSession) {
    throw new Error('Active LinX Pod session is missing a Solid session for capture persistence.')
  }

  return drizzle(session.solidSession, {
    logger: false,
    disableInteropDiscovery: true,
    podUrl: session.podUrl,
    resourcePreparation: 'best-effort' as never,
    schema: solidResources,
  }) as unknown as SolidDatabase
}

async function executeCaptureOperation(
  context: { db: CapturePersistenceDatabase; webId: string },
  params: LinxCaptureToolParams,
  toolCallId: string,
): Promise<unknown> {
  switch (params.operation) {
    case CaptureOperation.OBSERVED_CANDIDATE:
      return persistObservedCapture(context, buildObservedInput(params))

    case CaptureOperation.DIRECT_COMMIT_EVENT:
      return recordCaptureCommit(context, {
        ...buildCommitInput(params),
        decision: 'direct_commit',
      })

    case CaptureOperation.OPTIMISTIC_COMMIT_EVENT:
      return recordCaptureCommit(context, {
        ...buildCommitInput(params),
        decision: 'optimistic_commit',
      })

    case CaptureOperation.AMBIGUOUS_INPUT:
      return persistAmbiguousCapture(context, {
        ...buildObservedInput(params),
        inputRequestId: requireString(params, 'inputRequestId'),
        session: requireString(params, 'session'),
        prompt: requireString(params, 'prompt'),
        inputOptions: params.inputOptions,
        requestKind: params.requestKind,
        requester: params.requester,
        assignedTo: params.assignedTo,
        inputContext: params.inputContext,
        expiresAt: params.expiresAt,
      })

    case CaptureOperation.APPROVAL_REQUEST:
      return requestCaptureApproval(context, {
        ...buildObservedInput(params),
        approvalId: requireString(params, 'approvalId'),
        session: requireString(params, 'session'),
        toolCallId: params.toolCallId ?? toolCallId,
        toolName: params.toolName,
        target: requireString(params, 'target'),
        action: requireString(params, 'action'),
        risk: requireString(params, 'risk'),
        approvalOptions: params.approvalOptions,
        approvalContext: params.approvalContext,
        assignedTo: params.assignedTo,
        expiresAt: params.expiresAt,
      })

    case CaptureOperation.REVIEW_EVENT:
      return recordCaptureReviewEvent(context, {
        eventId: requireString(params, 'eventId'),
        source: requireString(params, 'source'),
        decision: params.decision ?? 'corrected',
        candidateId: params.candidateId,
        candidateIri: params.candidateIri,
        targetResource: params.targetResource,
        suggestedType: params.suggestedType,
        suggestedTarget: params.suggestedTarget,
        confidence: params.confidence,
        reason: params.reason,
        userCorrection: params.userCorrection,
        approval: params.approval,
        inputRequest: params.inputRequest,
        actor: params.actor,
        chat: params.chat,
        thread: params.thread,
        task: params.task,
        run: params.run,
        about: params.about,
        metadata: params.metadata,
        createdAt: params.createdAt,
      })
  }
}

function buildObservedInput(params: LinxCaptureToolParams) {
  return {
    id: requireString(params, 'id'),
    eventId: requireString(params, 'eventId'),
    source: requireString(params, 'source'),
    summary: requireString(params, 'summary'),
    suggestedType: params.suggestedType,
    suggestedTarget: params.suggestedTarget,
    confidence: params.confidence,
    reason: params.reason,
    actor: params.actor,
    chat: params.chat,
    thread: params.thread,
    task: params.task,
    run: params.run,
    sourceHash: params.sourceHash,
    metadata: params.metadata,
    createdAt: params.createdAt,
  }
}

function buildCommitInput(params: LinxCaptureToolParams) {
  return {
    eventId: requireString(params, 'eventId'),
    source: requireString(params, 'source'),
    targetResource: requireString(params, 'targetResource'),
    suggestedType: params.suggestedType,
    suggestedTarget: params.suggestedTarget,
    confidence: params.confidence,
    reason: params.reason,
    approval: params.approval,
    inputRequest: params.inputRequest,
    actor: params.actor,
    chat: params.chat,
    thread: params.thread,
    task: params.task,
    run: params.run,
    about: params.about,
    metadata: params.metadata,
    createdAt: params.createdAt,
  }
}

function requireString(params: LinxCaptureToolParams, key: keyof LinxCaptureToolParams): string {
  const value = params[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`linx_capture ${params.operation} requires ${String(key)}`)
  }
  return value
}

function okResult(operation: CaptureOperationType, result: unknown): LinxCaptureToolResult {
  return {
    content: [{ type: 'text' as const, text: `Capture ${operation} recorded: ${JSON.stringify(result)}` }],
    details: { operation, result },
  }
}

function errorResult(message: string): LinxCaptureToolResult {
  return {
    content: [{ type: 'text' as const, text: message }],
    details: { error: message },
    isError: true,
  }
}
