import { randomUUID } from 'node:crypto'
import { upsertExactRecord, type ExactRecordDatabase, type PodResource } from '@undefineds.co/drizzle-solid'
import { showLinxInteractiveError } from './linx-interactive-error-display.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'
import { DEFAULT_SECRETARY_CHAT_ID, secretaryChatUri, secretaryThreadUri } from './pod-mirror-mapping.js'
import { resolveLinxInteractivePodWebId } from './linx-interactive-runtime-host.js'
import { resolveLinxSessionId } from './linx-session-metadata.js'
import { registerLinxInteractiveSubmitHandler } from './linx-interactive-submit-router.js'
import { getDefaultPodDataSession, type PodDataSession } from './pod-data-session.js'
import {
  getLinxInteractiveCaptureIdea,
  getLinxInteractiveIdeaCaptureForegroundTimeoutMs,
  setLinxInteractiveLastIdeaCapture,
  type LinxInteractiveIdeaCaptureProjection,
} from './linx-interactive-shell-state.js'
import {
  chatResource,
  drizzle,
  ideaResource,
  solidResources,
  threadResource,
  type IdeaInsert,
  type SolidDatabase,
} from './models.js'

const ideaCaptureInstalled = new WeakSet<object>()
const DEFAULT_IDEA_CAPTURE_FOREGROUND_TIMEOUT_MS = 1_500

interface CapturedIdeaContext {
  uri: string
  summary: string
  status: string
  commitment: string
}

interface IdeaSourceContext {
  chat: string
  thread: string
  sessionId?: string
}

interface IdeaCapturePodRuntime {
  getPodDataSession: () => Promise<PodDataSession | null>
  createDb: (session: PodDataSession) => SolidDatabase & ExactRecordDatabase
  ideaResource: PodResource<any>
  chatResource: PodResource<any>
  threadResource: PodResource<any>
}

type IdeaCaptureHandler = (
  input: string,
  source: IdeaSourceContext | undefined,
) => unknown | Promise<unknown>

export function installLinxInteractiveIdeaCapture(interactive: any, runtime: any): void {
  if (!interactive || ideaCaptureInstalled.has(interactive)) {
    return
  }

  registerLinxInteractiveSubmitHandler(interactive, {
    name: 'linx-idea-capture',
    priority: 10,
    async handler({ interactive: target, input }) {
      if (!shouldConsiderIdeaCaptureInput(input) || !shouldCaptureIdeaInput(input)) {
        return false
      }
      showLinxInteractiveStatus(target, 'Capturing Idea…')
      const capture = captureInteractiveIdeaForInput(target, runtime, input)
      const projection = await waitForForegroundIdeaCapture(
        capture,
        resolveIdeaCaptureForegroundTimeoutMs(target),
      )
      setLinxInteractiveLastIdeaCapture(target, input, projection)
      if (projection?.kind === 'pending') {
        showLinxInteractiveStatus(target, 'Idea capture is still running; continuing chat.')
        void capture.catch((error) => {
          const normalized = normalizeError(error)
          showLinxInteractiveError(target, `Capture failed: ${normalized.message}`)
        })
      }
      return false
    },
  })

  ideaCaptureInstalled.add(interactive)
}

function resolveIdeaCaptureForegroundTimeoutMs(interactive: any): number {
  const configured = getLinxInteractiveIdeaCaptureForegroundTimeoutMs(interactive)
  return typeof configured === 'number' && Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_IDEA_CAPTURE_FOREGROUND_TIMEOUT_MS
}

async function waitForForegroundIdeaCapture(
  capture: Promise<LinxInteractiveIdeaCaptureProjection | undefined>,
  timeoutMs: number,
): Promise<LinxInteractiveIdeaCaptureProjection | undefined> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      capture,
      new Promise<LinxInteractiveIdeaCaptureProjection>((resolve) => {
        timeout = setTimeout(() => {
          resolve({ kind: 'pending', message: 'Idea capture is still running downstream.' })
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

export async function captureInteractiveIdeaForInput(
  interactive: any,
  runtime: any,
  input: string,
  options: { podRuntime?: IdeaCapturePodRuntime } = {},
): Promise<LinxInteractiveIdeaCaptureProjection | undefined> {
  try {
    const source = await resolveIdeaSourceContext(interactive, runtime)
    const context = await captureIdeaIfNeeded(
      input,
      source,
      getLinxInteractiveCaptureIdea(interactive),
      options.podRuntime,
    )
    if (!context) {
      return undefined
    }
    showLinxInteractiveStatus(interactive, `Captured Idea: ${context.summary} (${context.status}).`)
    return { kind: 'captured', context }
  } catch (error) {
    const normalized = normalizeError(error)
    showLinxInteractiveError(interactive, `Capture failed: ${normalized.message}`)
    return { kind: 'failed', error: normalized }
  }
}

export function renderIdeaCaptureProjection(ideaCapture: LinxInteractiveIdeaCaptureProjection | undefined): string[] {
  if (!ideaCapture) {
    return []
  }

  if (ideaCapture.kind === 'captured') {
    return [
      '',
      'Capture status:',
      'Idea already captured before this model turn.',
      `URI: ${ideaCapture.context.uri}`,
      `Summary: ${ideaCapture.context.summary}`,
      `Status: ${ideaCapture.context.status}`,
      `Commitment: ${ideaCapture.context.commitment}`,
      'Do not ask the user to repeat this capture and do not claim capture is still pending.',
    ]
  }

  if (ideaCapture.kind === 'pending') {
    return [
      '',
      'Capture status:',
      'Idea capture started before this model turn but is still waiting on a downstream Pod call.',
      `Status: ${ideaCapture.message}`,
      'Do not claim it was captured yet. Continue the answer normally and mention the pending capture only if relevant.',
    ]
  }

  return [
    '',
    'Capture status:',
    'Idea capture was required but Pod write failed before this model turn.',
    `Error: ${ideaCapture.error.message}`,
    'Do not claim it was captured. Surface the persistence blocker briefly if the user-facing answer would otherwise imply durable capture.',
  ]
}

export function serializeIdeaCaptureProjection(
  ideaCapture: LinxInteractiveIdeaCaptureProjection,
): Record<string, unknown> {
  if (ideaCapture.kind === 'captured') {
    return {
      kind: 'captured',
      ...ideaCapture.context,
    }
  }

  if (ideaCapture.kind === 'pending') {
    return {
      kind: 'pending',
      message: ideaCapture.message,
    }
  }

  return {
    kind: 'failed',
    message: ideaCapture.error.message,
  }
}

function shouldConsiderIdeaCaptureInput(input: string): boolean {
  return Boolean(input)
    && !input.startsWith('/')
    && !input.startsWith('!')
}

async function captureIdeaIfNeeded(
  input: string,
  source: IdeaSourceContext | undefined,
  captureIdea?: IdeaCaptureHandler,
  runtime?: IdeaCapturePodRuntime,
): Promise<CapturedIdeaContext | undefined> {
  if (!shouldCaptureIdeaInput(input)) {
    return undefined
  }

  if (captureIdea) {
    return normalizeCapturedIdeaContext(await captureIdea(input, source))
  }

  return persistCapturedIdeaToPod({
    input,
    source,
    affectedArea: inferIdeaAffectedArea(input),
    runtime,
  })
}

async function persistCapturedIdeaToPod(input: {
  input: string
  source?: IdeaSourceContext
  affectedArea?: string
  runtime?: IdeaCapturePodRuntime
}): Promise<CapturedIdeaContext> {
  const runtime = input.runtime ?? createDefaultIdeaCaptureRuntime()
  const podSession = await runtime.getPodDataSession()
  if (!podSession) {
    throw new Error('No active Pod session; Idea capture requires LinX/Solid login.')
  }

  const db = runtime.createDb(podSession)
  const now = new Date()
  const row = buildCapturedIdeaRow({
    input: input.input,
    source: input.source,
    webId: podSession.webId,
    now,
    affectedArea: input.affectedArea,
  })
  await db.init([
    runtime.ideaResource,
    runtime.chatResource,
    runtime.threadResource,
  ]).catch(() => undefined)
  await upsertExactRecord(db, runtime.ideaResource, { id: row.id }, row as Record<string, unknown>, {
    operation: 'linx.capture.idea.upsert',
  })
  return {
    uri: runtime.ideaResource.buildIri(podSession.webId, { id: row.id, createdAt: row.createdAt }),
    summary: row.summary,
    status: row.status,
    commitment: row.commitment,
  }
}

function createDefaultIdeaCaptureRuntime(): IdeaCapturePodRuntime {
  return {
    getPodDataSession: getDefaultPodDataSession,
    createDb(podSession) {
      return drizzle(podSession.solidSession, {
        logger: false,
        disableInteropDiscovery: true,
        podUrl: podSession.podUrl,
        resourcePreparation: 'best-effort' as never,
        schema: solidResources,
      }) as unknown as SolidDatabase & ExactRecordDatabase
    },
    ideaResource,
    chatResource,
    threadResource,
  }
}

function buildCapturedIdeaRow(input: {
  input: string
  source?: IdeaSourceContext
  webId: string
  now: Date
  affectedArea?: string
}): IdeaInsert & { id: string; summary: string; status: string; commitment: string; createdAt: Date; updatedAt: Date } {
  const text = input.input.trim()
  const summary = summarizeIdeaInput(text)
  const id = buildIdeaResourceId(input.now)
  return {
    id,
    summary,
    input: text,
    status: 'captured',
    commitment: 'thought',
    affectedArea: input.affectedArea,
    currentUnderstanding: text,
    openQuestions: [],
    related: [],
    conflicts: [],
    nextStep: 'Review this captured Idea against related conversation and promote only after scope and commitment are clear.',
    chat: input.source?.chat,
    thread: input.source?.thread,
    sourceMessages: [],
    createdBy: input.webId,
    metadata: {
      surface: 'linx-capture',
      source: 'interactive-user-message',
      ...(input.source?.sessionId ? { sessionId: input.source.sessionId } : {}),
    },
    createdAt: input.now,
    updatedAt: input.now,
  }
}

function buildIdeaResourceId(now: Date): string {
  const yyyy = String(now.getUTCFullYear()).padStart(4, '0')
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd}.ttl#idea_${now.toISOString().replace(/[-:.TZ]/g, '')}_${randomUUID().slice(0, 8)}`
}

function shouldCaptureIdeaInput(input: string): boolean {
  const normalized = input.trim()
  if (normalized.length < 12) {
    return false
  }
  return /\b(idea|maybe|perhaps|could we|should we|what if|proposal|direction)\b/iu.test(normalized)
    || /(我觉得|感觉|也许|可能|考虑|想法|方向|要不要|能不能|是不是|是否|应该)/u.test(normalized)
}

function inferIdeaAffectedArea(input: string): string | undefined {
  const normalized = input.toLowerCase()
  if (/symphony|secretary|auto|approval|grant|pod|xpod|skill|worker|agent|capture/u.test(normalized)) {
    return normalized.match(/symphony|secretary|auto|approval|grant|pod|xpod|skill|worker|agent|capture/u)?.[0]
  }
  if (/(建模|模型|数据|同步|权限|审批|托管|多端|工作流|指标|质检|抓取|收藏|记忆)/u.test(input)) {
    return input.match(/建模|模型|数据|同步|权限|审批|托管|多端|工作流|指标|质检|抓取|收藏|记忆/u)?.[0]
  }
  return undefined
}

function summarizeIdeaInput(input: string): string {
  const normalized = input.replace(/\s+/g, ' ').trim()
  return normalized.length <= 80 ? normalized : `${normalized.slice(0, 77)}...`
}

function normalizeCapturedIdeaContext(value: unknown): CapturedIdeaContext | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const uri = normalizeString(value.uri)
  const summary = normalizeString(value.summary)
  if (!uri || !summary) {
    return undefined
  }
  return {
    uri,
    summary,
    status: normalizeString(value.status) ?? 'captured',
    commitment: normalizeString(value.commitment) ?? 'thought',
  }
}

async function resolveIdeaSourceContext(interactive: any, runtime: any): Promise<IdeaSourceContext | undefined> {
  const sessionId = resolveLinxSessionId({ interactive, runtime })
  const webId = await resolveLinxInteractivePodWebId(interactive)
  if (typeof sessionId !== 'string' || !sessionId.trim() || !webId) {
    return undefined
  }

  const trimmedSessionId = sessionId.trim()
  return {
    chat: secretaryChatUri(webId),
    thread: secretaryThreadUri(webId, trimmedSessionId, DEFAULT_SECRETARY_CHAT_ID),
    sessionId: trimmedSessionId,
  }
}

function normalizeString(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || undefined
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}
