import {
  CaptureCandidateStatus,
  CaptureDecision,
  approvalResource,
  captureCandidateResource,
  captureEventResource,
  hasCaptureForSource,
  inputRequestResource,
  type CaptureConfidenceType,
  type CaptureDecisionType,
} from '@undefineds.co/models'

export interface CapturePersistenceDatabase {
  select(): {
    from(resource: unknown): {
      execute(): Promise<Array<Record<string, unknown>>>
    }
  }
  insert(resource: unknown): {
    values(row: Record<string, unknown>): {
      execute(): Promise<unknown>
    }
  }
  updateById(resource: unknown, id: string, patch: Record<string, unknown>): Promise<unknown>
}

export interface CapturePersistenceContext {
  db: CapturePersistenceDatabase
  webId?: string
}

export interface ObservedCaptureInput {
  id: string
  eventId: string
  source: string
  summary: string
  suggestedType?: string
  suggestedTarget?: string
  confidence?: CaptureConfidenceType
  reason?: string
  actor?: string
  chat?: string
  thread?: string
  task?: string
  run?: string
  sourceHash?: string
  metadata?: Record<string, unknown>
  createdAt?: Date | string | number
}

export type ObservedCapturePersistenceResult =
  | {
    status: 'created'
    candidateId: string
    candidateIri: string
    eventId: string
  }
  | {
    status: 'duplicate'
    eventId: string
  }

export interface CaptureCommitInput {
  eventId: string
  source: string
  targetResource: string
  decision: Extract<CaptureDecisionType, 'direct_commit' | 'optimistic_commit'> | 'direct_commit' | 'optimistic_commit'
  suggestedType?: string
  suggestedTarget?: string
  confidence?: CaptureConfidenceType
  reason?: string
  approval?: string
  inputRequest?: string
  actor?: string
  chat?: string
  thread?: string
  task?: string
  run?: string
  about?: string
  metadata?: Record<string, unknown>
  createdAt?: Date | string | number
}

export interface CaptureCommitResult {
  status: 'recorded'
  eventId: string
}

export interface CaptureFormalWriteResult {
  targetResource: string
}

export interface CaptureFormalCommitInput extends Omit<CaptureCommitInput, 'targetResource' | 'decision'> {
  targetResource?: string
  writeFormalResource?: () => Promise<CaptureFormalWriteResult>
}

export interface CaptureExplicitCommitResult {
  status: 'committed'
  targetResource: string
  eventId: string
}

export interface CaptureOptimisticCommitInput extends Omit<CaptureApprovalInput, 'id' | 'summary'> {
  targetResource?: string
  writeFormalResource?: () => Promise<CaptureFormalWriteResult>
  inputRequest?: string
  about?: string
}

export interface CaptureOptimisticCommitResult {
  status: 'pending_approval'
  targetResource: string
  approvalId: string
  approvalIri: string
  eventId: string
}

export interface AmbiguousCaptureInput extends ObservedCaptureInput {
  inputRequestId: string
  session: string
  prompt: string
  inputOptions?: string
  requestKind?: string
  requester?: string
  assignedTo?: string
  inputContext?: string
  expiresAt?: Date | string | number
}

export interface AmbiguousCapturePersistenceResult {
  status: 'waiting_input'
  candidateId: string
  candidateIri: string
  inputRequestId: string
  inputRequestIri: string
  eventId: string
}

export interface CaptureApprovalInput extends ObservedCaptureInput {
  approvalId: string
  session: string
  toolCallId: string
  toolName?: string
  target: string
  action: string
  risk: string
  approvalOptions?: string
  approvalContext?: string
  assignedTo?: string
  expiresAt?: Date | string | number
}

export interface CaptureApprovalResult {
  status: 'waiting_approval'
  candidateId: string
  candidateIri: string
  approvalId: string
  approvalIri: string
  eventId: string
}

export interface CaptureReviewEventInput {
  eventId: string
  source: string
  decision: Extract<CaptureDecisionType, 'promoted' | 'rejected' | 'corrected' | 'rollback' | 'ignored'> | 'promoted' | 'rejected' | 'corrected' | 'rollback' | 'ignored'
  candidateId?: string
  candidateIri?: string
  targetResource?: string
  suggestedType?: string
  suggestedTarget?: string
  confidence?: CaptureConfidenceType
  reason?: string
  userCorrection?: string
  approval?: string
  inputRequest?: string
  actor?: string
  chat?: string
  thread?: string
  task?: string
  run?: string
  about?: string
  metadata?: Record<string, unknown>
  createdAt?: Date | string | number
}

export interface CaptureReviewEventResult {
  status: 'recorded'
  eventId: string
}

export async function persistObservedCapture(
  context: CapturePersistenceContext,
  input: ObservedCaptureInput,
): Promise<ObservedCapturePersistenceResult> {
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date()
  const duplicate = await hasCaptureForSource(context.db as never, { source: input.source })
  if (duplicate) {
    const eventId = captureEventResource.buildId({ id: input.eventId, source: input.source, decision: CaptureDecision.DUPLICATE, createdAt })
    await insertCaptureEvent(context.db, {
      id: eventId,
      source: input.source,
      decision: CaptureDecision.DUPLICATE,
      reason: input.reason,
      actor: input.actor,
      chat: input.chat,
      thread: input.thread,
      task: input.task,
      run: input.run,
      metadata: input.metadata,
      createdAt,
    })
    return { status: 'duplicate', eventId }
  }

  const candidateId = captureCandidateResource.buildId({ id: input.id, source: input.source, summary: input.summary, createdAt })
  const candidateIri = buildResourceIri(context, captureCandidateResource, {
    id: input.id,
    source: input.source,
    summary: input.summary,
    createdAt,
  }, candidateId)

  await context.db.insert(captureCandidateResource).values(stripUndefined({
    id: candidateId,
    source: input.source,
    summary: input.summary,
    suggestedType: input.suggestedType,
    suggestedTarget: input.suggestedTarget,
    confidence: input.confidence ?? 'medium',
    reason: input.reason,
    status: CaptureCandidateStatus.CANDIDATE,
    sourceHash: input.sourceHash,
    chat: input.chat,
    thread: input.thread,
    task: input.task,
    run: input.run,
    actor: input.actor,
    metadata: input.metadata,
    createdAt,
    updatedAt: createdAt,
  })).execute()

  const eventId = captureEventResource.buildId({ id: input.eventId, source: input.source, decision: CaptureDecision.CANDIDATE_CREATED, createdAt })
  await insertCaptureEvent(context.db, {
    id: eventId,
    source: input.source,
    captureCandidate: candidateIri,
    decision: CaptureDecision.CANDIDATE_CREATED,
    suggestedType: input.suggestedType,
    suggestedTarget: input.suggestedTarget,
    confidence: input.confidence ?? 'medium',
    reason: input.reason,
    actor: input.actor,
    chat: input.chat,
    thread: input.thread,
    task: input.task,
    run: input.run,
    metadata: input.metadata,
    createdAt,
  })

  return {
    status: 'created',
    candidateId,
    candidateIri,
    eventId,
  }
}

export async function recordCaptureCommit(
  context: CapturePersistenceContext,
  input: CaptureCommitInput,
): Promise<CaptureCommitResult> {
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date()
  const eventId = captureEventResource.buildId({
    id: input.eventId,
    source: input.source,
    decision: input.decision,
    createdAt,
  })

  await insertCaptureEvent(context.db, {
    id: eventId,
    source: input.source,
    targetResource: input.targetResource,
    decision: input.decision,
    suggestedType: input.suggestedType,
    suggestedTarget: input.suggestedTarget,
    confidence: input.confidence,
    reason: input.reason,
    approval: input.approval,
    inputRequest: input.inputRequest,
    actor: input.actor,
    chat: input.chat,
    thread: input.thread,
    task: input.task,
    run: input.run,
    about: input.about,
    metadata: input.metadata,
    createdAt,
  })

  return {
    status: 'recorded',
    eventId,
  }
}

export async function commitExplicitCapture(
  context: CapturePersistenceContext,
  input: CaptureFormalCommitInput,
): Promise<CaptureExplicitCommitResult> {
  const targetResource = await resolveFormalTargetResource(input)
  const recorded = await recordCaptureCommit(context, {
    ...input,
    targetResource,
    decision: CaptureDecision.DIRECT_COMMIT,
  })
  return {
    status: 'committed',
    targetResource,
    eventId: recorded.eventId,
  }
}

export async function commitOptimisticCapture(
  context: CapturePersistenceContext,
  input: CaptureOptimisticCommitInput,
): Promise<CaptureOptimisticCommitResult> {
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date()
  const targetResource = await resolveFormalTargetResource(input)
  const approval = await insertApprovalRequest(context, input, createdAt, targetResource)
  const eventId = captureEventResource.buildId({
    id: input.eventId,
    source: input.source,
    decision: CaptureDecision.OPTIMISTIC_COMMIT,
    createdAt,
  })

  await insertCaptureEvent(context.db, {
    id: eventId,
    source: input.source,
    targetResource,
    decision: CaptureDecision.OPTIMISTIC_COMMIT,
    suggestedType: input.suggestedType,
    suggestedTarget: input.suggestedTarget,
    confidence: input.confidence,
    reason: input.reason,
    approval: approval.approvalIri,
    inputRequest: input.inputRequest,
    actor: input.actor,
    chat: input.chat,
    thread: input.thread,
    task: input.task,
    run: input.run,
    about: input.about,
    metadata: input.metadata,
    createdAt,
  })

  return {
    status: 'pending_approval',
    targetResource,
    approvalId: approval.approvalId,
    approvalIri: approval.approvalIri,
    eventId,
  }
}

export async function persistAmbiguousCapture(
  context: CapturePersistenceContext,
  input: AmbiguousCaptureInput,
): Promise<AmbiguousCapturePersistenceResult> {
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date()
  const candidate = await insertCaptureCandidate(context, input, createdAt)
  const inputRequestId = inputRequestResource.buildId({ id: input.inputRequestId, createdAt })
  const inputRequestIri = buildResourceIri(context, inputRequestResource, { id: input.inputRequestId, createdAt }, inputRequestId)

  await context.db.insert(inputRequestResource).values(stripUndefined({
    id: inputRequestId,
    session: input.session,
    chat: input.chat,
    thread: input.thread,
    run: input.run,
    task: input.task,
    requester: input.requester ?? input.actor,
    requestKind: input.requestKind ?? 'capture-classification',
    prompt: input.prompt,
    context: input.inputContext ?? input.reason,
    inputOptions: input.inputOptions,
    status: 'pending',
    assignedTo: input.assignedTo,
    metadata: input.metadata,
    createdAt,
    expiresAt: normalizeOptionalDate(input.expiresAt),
  })).execute()

  const eventId = captureEventResource.buildId({
    id: input.eventId,
    source: input.source,
    decision: CaptureDecision.CANDIDATE_CREATED,
    createdAt,
  })
  await insertCaptureEvent(context.db, {
    id: eventId,
    source: input.source,
    captureCandidate: candidate.candidateIri,
    decision: CaptureDecision.CANDIDATE_CREATED,
    suggestedType: input.suggestedType,
    suggestedTarget: input.suggestedTarget,
    confidence: input.confidence ?? 'medium',
    reason: input.reason,
    inputRequest: inputRequestIri,
    actor: input.actor,
    chat: input.chat,
    thread: input.thread,
    task: input.task,
    run: input.run,
    metadata: input.metadata,
    createdAt,
  })

  return {
    status: 'waiting_input',
    candidateId: candidate.candidateId,
    candidateIri: candidate.candidateIri,
    inputRequestId,
    inputRequestIri,
    eventId,
  }
}

export async function requestCaptureApproval(
  context: CapturePersistenceContext,
  input: CaptureApprovalInput,
): Promise<CaptureApprovalResult> {
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date()
  const candidate = await insertCaptureCandidate(context, input, createdAt)
  const approval = await insertApprovalRequest(context, input, createdAt, input.target)

  const eventId = captureEventResource.buildId({
    id: input.eventId,
    source: input.source,
    decision: CaptureDecision.CANDIDATE_CREATED,
    createdAt,
  })
  await insertCaptureEvent(context.db, {
    id: eventId,
    source: input.source,
    captureCandidate: candidate.candidateIri,
    decision: CaptureDecision.CANDIDATE_CREATED,
    suggestedType: input.suggestedType,
    suggestedTarget: input.suggestedTarget,
    confidence: input.confidence ?? 'medium',
    reason: input.reason,
    approval: approval.approvalIri,
    actor: input.actor,
    chat: input.chat,
    thread: input.thread,
    task: input.task,
    run: input.run,
    metadata: input.metadata,
    createdAt,
  })

  return {
    status: 'waiting_approval',
    candidateId: candidate.candidateId,
    candidateIri: candidate.candidateIri,
    approvalId: approval.approvalId,
    approvalIri: approval.approvalIri,
    eventId,
  }
}

export async function recordCaptureReviewEvent(
  context: CapturePersistenceContext,
  input: CaptureReviewEventInput,
): Promise<CaptureReviewEventResult> {
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date()
  const eventId = captureEventResource.buildId({
    id: input.eventId,
    source: input.source,
    decision: input.decision,
    createdAt,
  })

  const nextCandidateStatus = candidateStatusForReviewDecision(input.decision)
  if (input.candidateId && nextCandidateStatus) {
    await context.db.updateById(captureCandidateResource, input.candidateId, { status: nextCandidateStatus })
  }

  await insertCaptureEvent(context.db, {
    id: eventId,
    source: input.source,
    captureCandidate: input.candidateIri,
    targetResource: input.targetResource,
    decision: input.decision,
    suggestedType: input.suggestedType,
    suggestedTarget: input.suggestedTarget,
    confidence: input.confidence,
    reason: input.reason,
    userCorrection: input.userCorrection,
    approval: input.approval,
    inputRequest: input.inputRequest,
    actor: input.actor,
    chat: input.chat,
    thread: input.thread,
    task: input.task,
    run: input.run,
    about: input.about,
    metadata: input.metadata,
    createdAt,
  })

  return { status: 'recorded', eventId }
}

async function insertCaptureCandidate(
  context: CapturePersistenceContext,
  input: ObservedCaptureInput,
  createdAt: Date,
): Promise<{ candidateId: string; candidateIri: string }> {
  const candidateId = captureCandidateResource.buildId({ id: input.id, source: input.source, summary: input.summary, createdAt })
  const candidateIri = buildResourceIri(context, captureCandidateResource, {
    id: input.id,
    source: input.source,
    summary: input.summary,
    createdAt,
  }, candidateId)

  await context.db.insert(captureCandidateResource).values(stripUndefined({
    id: candidateId,
    source: input.source,
    summary: input.summary,
    suggestedType: input.suggestedType,
    suggestedTarget: input.suggestedTarget,
    confidence: input.confidence ?? 'medium',
    reason: input.reason,
    status: CaptureCandidateStatus.CANDIDATE,
    sourceHash: input.sourceHash,
    chat: input.chat,
    thread: input.thread,
    task: input.task,
    run: input.run,
    actor: input.actor,
    metadata: input.metadata,
    createdAt,
    updatedAt: createdAt,
  })).execute()

  return { candidateId, candidateIri }
}

async function insertApprovalRequest(
  context: CapturePersistenceContext,
  input: Omit<CaptureApprovalInput, 'id' | 'summary'>,
  createdAt: Date,
  target: string,
): Promise<{ approvalId: string; approvalIri: string }> {
  const approvalId = approvalResource.buildId({ id: input.approvalId, createdAt })
  const approvalIri = buildResourceIri(context, approvalResource, { id: input.approvalId, createdAt }, approvalId)

  await context.db.insert(approvalResource).values(stripUndefined({
    id: approvalId,
    session: input.session,
    chat: input.chat,
    thread: input.thread,
    toolCallId: input.toolCallId,
    toolName: input.toolName ?? 'capture',
    target,
    action: input.action,
    risk: input.risk,
    status: 'pending',
    assignedTo: input.assignedTo,
    reason: input.reason,
    context: input.approvalContext ?? input.reason,
    approvalOptions: input.approvalOptions,
    createdAt,
    expiresAt: normalizeOptionalDate(input.expiresAt),
  })).execute()

  return { approvalId, approvalIri }
}

async function resolveFormalTargetResource(
  input: { targetResource?: string; writeFormalResource?: () => Promise<CaptureFormalWriteResult> },
): Promise<string> {
  if (input.writeFormalResource) {
    const result = await input.writeFormalResource()
    if (!result.targetResource) {
      throw new Error('Formal capture writer did not return targetResource.')
    }
    return result.targetResource
  }
  if (!input.targetResource) {
    throw new Error('Formal capture requires targetResource or writeFormalResource.')
  }
  return input.targetResource
}

async function insertCaptureEvent(
  db: CapturePersistenceDatabase,
  row: Record<string, unknown> & { decision: CaptureDecisionType | string },
): Promise<void> {
  await db.insert(captureEventResource).values(stripUndefined(row)).execute()
}

function buildResourceIri(
  context: CapturePersistenceContext,
  resource: typeof captureCandidateResource | typeof captureEventResource | typeof inputRequestResource | typeof approvalResource,
  row: Record<string, unknown>,
  fallbackId: string,
): string {
  if (!context.webId) {
    return fallbackId
  }
  return resource.buildIri(context.webId, row)
}

function normalizeOptionalDate(value: Date | string | number | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value)
}

function candidateStatusForReviewDecision(
  decision: CaptureReviewEventInput['decision'],
): string | null {
  switch (decision) {
    case CaptureDecision.PROMOTED:
      return CaptureCandidateStatus.PROMOTED
    case CaptureDecision.REJECTED:
    case CaptureDecision.ROLLBACK:
      return CaptureCandidateStatus.REJECTED
    default:
      return null
  }
}

function stripUndefined(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined))
}
