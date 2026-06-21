import type {
  SymphonyRuntimeAdapter,
  SymphonyRuntimeAdapterEvent,
  SymphonyRuntimeAdapterResult,
} from '@linx/stores/symphony-control'
import type { AutoModeInteractionRequest } from '@linx/agent-runtime/auto-mode'
import type { SymphonyRunPlan, SymphonyWorkerPlan, WorkerWorkspace } from '@linx/agent-runtime/symphony'
import type {
  RuntimeRunnerType,
  RuntimeSessionEvent,
  RuntimeSessionRecord,
  RuntimeToolType,
  RuntimeWorkspaceKind,
} from '@/modules/chat/runtime-client'

interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

interface EventSourceLike {
  onmessage: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  close(): void
}

interface EventSourceConstructorLike {
  new (url: string): EventSourceLike
}

export interface CreateServiceRuntimeSymphonyAdapterOptions {
  fetch?: FetchLike
  EventSource?: EventSourceConstructorLike
  baseUrl?: string
  timeoutMs?: number
  runnerType?: RuntimeRunnerType
  tool?: RuntimeToolType
  onInteractionRequest?: (input: {
    plan: SymphonyRunPlan
    worker: SymphonyWorkerPlan
    request: AutoModeInteractionRequest
    event: RuntimeSessionEvent
  }) => Promise<void> | void
}

const DEFAULT_TIMEOUT_MS = 10 * 60_000

export function createServiceRuntimeSymphonyAdapter(
  options: CreateServiceRuntimeSymphonyAdapterOptions = {},
): SymphonyRuntimeAdapter {
  return {
    async run(input) {
      const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis)
      if (!fetchImpl) {
        throw new Error('Service runtime Symphony adapter requires fetch.')
      }
      const EventSourceImpl = options.EventSource ?? globalThis.EventSource
      if (!EventSourceImpl) {
        throw new Error('Service runtime Symphony adapter requires EventSource.')
      }

      const runtimeInput = buildRuntimeSessionInput(input.worker, {
        runnerType: options.runnerType,
        tool: options.tool,
      })
      const created = await postRuntimeJson<RuntimeSessionRecord>(fetchImpl, options.baseUrl, '/api/runtime/threads', runtimeInput)
      const started = await postRuntimeJson<RuntimeSessionRecord>(fetchImpl, options.baseUrl, `/api/runtime/threads/${encodeURIComponent(created.id)}/start`, undefined)

      return runPromptThroughRuntimeEvents({
        fetch: fetchImpl,
        EventSource: EventSourceImpl,
        baseUrl: options.baseUrl,
        sessionId: started.id,
        prompt: input.prompt,
        signal: input.signal,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        plan: input.plan,
        worker: input.worker,
        onInteractionRequest: options.onInteractionRequest,
      })
    },
  }
}

export function buildRuntimeSessionInput(
  worker: SymphonyWorkerPlan,
  options: { runnerType?: RuntimeRunnerType; tool?: RuntimeToolType } = {},
): {
  threadId: string
  title: string
  container?: string
  workspaceKind: RuntimeWorkspaceKind
  repoPath?: string
  folderPath?: string
  runnerType: RuntimeRunnerType
  tool: RuntimeToolType
  baseRef?: string
  branch?: string
} {
  const workspace = worker.session.workspace
  const runtimeWorkspace = mapSymphonyWorkspaceToRuntimeInput(workspace, worker.session.cwd)
  return {
    threadId: worker.session.thread ?? worker.session.uri,
    title: worker.taskRecord.title,
    ...runtimeWorkspace,
    runnerType: options.runnerType ?? 'xpod-pty',
    tool: options.tool ?? mapBackendToRuntimeTool(worker.session.backend),
  }
}

export function mapSymphonyWorkspaceToRuntimeInput(
  workspace: WorkerWorkspace | undefined,
  fallbackPath: string,
): {
  container?: string
  workspaceKind: RuntimeWorkspaceKind
  repoPath?: string
  folderPath?: string
  baseRef?: string
  branch?: string
} {
  const container = trim(workspace?.container)
  const path = trim(workspace?.path) || fallbackPath.trim()
  const worktree = trim(workspace?.worktree)
  const branch = trim(workspace?.branch)
  const baseRef = trim(workspace?.baseRevision)

  if (container && isHttpUrl(container)) {
    return {
      container,
      workspaceKind: 'pod-container',
      ...(baseRef ? { baseRef } : {}),
      ...(branch ? { branch } : {}),
    }
  }

  if (!path) {
    throw new Error('Symphony worker runtime session is missing a workspace path.')
  }

  if (workspace?.kind === 'worktree') {
    return {
      workspaceKind: 'local-worktree',
      repoPath: path,
      folderPath: worktree || path,
      ...(baseRef ? { baseRef } : {}),
      ...(branch ? { branch } : {}),
    }
  }

  return {
    workspaceKind: 'local-folder',
    repoPath: path,
    folderPath: path,
    ...(baseRef ? { baseRef } : {}),
    ...(branch ? { branch } : {}),
  }
}

export function mapRuntimeSessionEventToSymphonyEvent(
  event: RuntimeSessionEvent,
): SymphonyRuntimeAdapterEvent | null {
  const payload = runtimeEventPayload(event)
  switch (event.type) {
    case 'meta':
      return {
        stepType: 'session.started',
        message: `Runtime session started with ${event.runner}.`,
        payload,
        now: new Date(event.ts),
      }
    case 'status':
      return {
        stepType: 'run.step',
        message: `Runtime status: ${event.status}.`,
        payload,
        now: new Date(event.ts),
      }
    case 'stdout':
    case 'stderr':
    case 'assistant_delta':
    case 'tool_call':
      return {
        stepType: 'run.step',
        message: summarizeRuntimeEvent(event),
        payload,
        now: new Date(event.ts),
      }
    case 'auth_required':
      return {
        stepType: 'input.required',
        message: event.message || `Runtime requires ${event.method} authentication/input.`,
        payload,
        now: new Date(event.ts),
      }
    case 'assistant_done':
      return {
        stepType: 'delivery.submitted',
        message: 'Runtime submitted a final assistant report.',
        payload,
        now: new Date(event.ts),
      }
    case 'exit':
      return {
        stepType: event.code === 0 ? 'run.completed' : 'run.failed',
        message: event.code === 0 ? 'Runtime process exited successfully.' : `Runtime process exited with code ${event.code ?? 'null'}.`,
        payload,
        now: new Date(event.ts),
      }
    case 'error':
      return {
        stepType: 'run.failed',
        message: event.message,
        payload,
        now: new Date(event.ts),
      }
  }
}


export function runtimeSessionEventToInteractionRequest(event: RuntimeSessionEvent): AutoModeInteractionRequest | null {
  if (event.type === 'auth_required') {
    return {
      kind: 'user-input',
      message: event.message || `Runtime requires ${event.method}.`,
      questions: [{
        id: 'runtime-auth',
        header: 'Auth',
        question: event.message || `Complete ${event.method} for this worker runtime.`,
        options: [],
      }],
      raw: event,
    }
  }

  if (event.type === 'tool_call') {
    return {
      kind: 'user-input',
      message: `Runtime requested tool result for ${event.name}.`,
      questions: [{
        id: 'tool-output',
        header: 'Tool',
        question: `Provide the result for tool call ${event.name} (${event.requestId}).`,
        options: [],
      }],
      raw: event,
    }
  }

  return null
}

async function runPromptThroughRuntimeEvents(input: {
  fetch: FetchLike
  EventSource: EventSourceConstructorLike
  baseUrl?: string
  sessionId: string
  prompt: string
  signal?: AbortSignal
  timeoutMs: number
  plan: SymphonyRunPlan
  worker: SymphonyWorkerPlan
  onInteractionRequest?: CreateServiceRuntimeSymphonyAdapterOptions['onInteractionRequest']
}): Promise<SymphonyRuntimeAdapterResult> {
  const events: SymphonyRuntimeAdapterEvent[] = []
  let reportText = ''
  let settled = false
  let finishing = false
  let eventSource: EventSourceLike | null = null
  const pendingInteractions: Promise<void>[] = []

  return new Promise<SymphonyRuntimeAdapterResult>((resolve, reject) => {
    const cleanup = () => {
      settled = true
      eventSource?.close()
      eventSource = null
      clearTimeout(timeout)
      input.signal?.removeEventListener('abort', abortListener)
    }
    const finish = (result: SymphonyRuntimeAdapterResult) => {
      if (settled || finishing) return
      finishing = true
      void Promise.all(pendingInteractions).then(() => {
        if (settled) return
        cleanup()
        resolve(result)
      }, fail)
    }
    const fail = (error: unknown) => {
      if (settled) return
      cleanup()
      reject(error)
    }
    const abortListener = () => fail(new Error('Symphony runtime session was aborted.'))
    const timeout = setTimeout(() => {
      finish({
        status: 'failed',
        exitCode: 1,
        autoModeSessionId: input.sessionId,
        reportText: reportText || `Runtime session timed out after ${input.timeoutMs}ms.`,
        events,
      })
    }, input.timeoutMs)

    if (input.signal?.aborted) {
      abortListener()
      return
    }
    input.signal?.addEventListener('abort', abortListener, { once: true })

    try {
      eventSource = new input.EventSource(runtimeUrl(input.baseUrl, `/api/runtime/threads/${encodeURIComponent(input.sessionId)}/events`))
      eventSource.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as RuntimeSessionEvent
          const request = runtimeSessionEventToInteractionRequest(event)
          if (request && input.onInteractionRequest) {
            const interaction = Promise.resolve(input.onInteractionRequest({
              plan: input.plan,
              worker: input.worker,
              request,
              event,
            }))
            pendingInteractions.push(interaction)
            void interaction.catch(fail)
          }
          const mapped = mapRuntimeSessionEventToSymphonyEvent(event)
          if (mapped) {
            events.push(mapped)
          }
          if (event.type === 'assistant_done') {
            reportText = event.text
            finish({
              status: 'completed',
              exitCode: 0,
              autoModeSessionId: input.sessionId,
              reportText,
              events,
            })
            return
          }
          if (event.type === 'error') {
            finish({
              status: 'failed',
              exitCode: 1,
              autoModeSessionId: input.sessionId,
              reportText: event.message,
              events,
            })
            return
          }
          if (event.type === 'exit') {
            finish({
              status: event.code === 0 ? 'completed' : 'failed',
              exitCode: event.code ?? 1,
              autoModeSessionId: input.sessionId,
              reportText: reportText || summarizeRuntimeEvent(event),
              events,
            })
          }
        } catch (error) {
          fail(error)
        }
      }
      eventSource.onerror = (error) => fail(error instanceof Error ? error : new Error('Runtime event stream failed.'))
    } catch (error) {
      fail(error)
      return
    }

    void postRuntimeJson<RuntimeSessionRecord>(
      input.fetch,
      input.baseUrl,
      `/api/runtime/threads/${encodeURIComponent(input.sessionId)}/message`,
      { text: input.prompt },
    ).catch(fail)
  })
}

async function postRuntimeJson<T>(
  fetchImpl: FetchLike,
  baseUrl: string | undefined,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetchImpl(runtimeUrl(baseUrl, path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { error?: unknown } | null
    throw new Error(typeof errorBody?.error === 'string' ? errorBody.error : `Runtime request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

function runtimeUrl(baseUrl: string | undefined, path: string): string {
  if (!baseUrl) return path
  return new URL(path, baseUrl).toString()
}

function mapBackendToRuntimeTool(backend: string): RuntimeToolType {
  if (backend === 'codex' || backend === 'claude' || backend === 'codebuddy') {
    return backend
  }
  throw new Error(`Web service runtime adapter does not support backend: ${backend}`)
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function trim(value?: string): string {
  return value?.trim() ?? ''
}

function runtimeEventPayload(event: RuntimeSessionEvent): Record<string, unknown> {
  return {
    source: 'web-service-runtime',
    runtimeEventType: event.type,
    runtimeThreadId: event.threadId,
    ...(event.type === 'meta' ? { runner: event.runner, workdir: event.workdir } : {}),
    ...(event.type === 'status' ? { status: event.status } : {}),
    ...(event.type === 'stdout' || event.type === 'stderr' || event.type === 'assistant_delta' || event.type === 'assistant_done' ? { text: event.text } : {}),
    ...(event.type === 'auth_required' ? { method: event.method, url: event.url, options: event.options } : {}),
    ...(event.type === 'tool_call' ? { requestId: event.requestId, name: event.name, arguments: event.arguments } : {}),
    ...(event.type === 'exit' ? { code: event.code, signal: event.signal } : {}),
    ...(event.type === 'error' ? { error: event.message } : {}),
  }
}

function summarizeRuntimeEvent(event: RuntimeSessionEvent): string {
  switch (event.type) {
    case 'stdout':
    case 'stderr':
    case 'assistant_delta':
    case 'assistant_done':
      return event.text
    case 'tool_call':
      return `Runtime requested tool call ${event.name}.`
    case 'exit':
      return `Runtime exited with code ${event.code ?? 'null'}.`
    case 'error':
      return event.message
    case 'auth_required':
      return event.message || `Runtime requires ${event.method}.`
    case 'meta':
      return `Runtime session started with ${event.runner}.`
    case 'status':
      return `Runtime status: ${event.status}.`
  }
}
