import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export type RuntimeThreadStatus = 'idle' | 'active' | 'paused' | 'completed' | 'error'
export type RuntimeSessionStatus = RuntimeThreadStatus
export type RuntimeToolType = 'codex' | 'claude' | 'codebuddy' | 'mock'
export const DEFAULT_RUNTIME_TOOL: RuntimeToolType = 'codex'
export const DEFAULT_RUNTIME_BASE_REF = 'HEAD'

export interface RuntimeThreadRecord {
  id: string
  threadId: string
  title: string
  repoPath: string
  worktreePath: string
  mountId?: string
  mountPath?: string
  tool: RuntimeToolType
  status: RuntimeThreadStatus
  tokenUsage: number
  createdAt: string
  updatedAt: string
  lastActivityAt: string
  baseRef?: string
  branch?: string
  lastError?: string
}

export type RuntimeSessionRecord = RuntimeThreadRecord

export type RuntimeThreadEvent =
  | { type: 'meta'; ts: number; threadId: string; runner: string; workdir: string }
  | { type: 'status'; ts: number; threadId: string; status: RuntimeThreadStatus }
  | { type: 'stdout'; ts: number; threadId: string; text: string }
  | { type: 'stderr'; ts: number; threadId: string; text: string }
  | { type: 'assistant_delta'; ts: number; threadId: string; text: string }
  | { type: 'assistant_done'; ts: number; threadId: string; text: string }
  | { type: 'auth_required'; ts: number; threadId: string; method: string; url?: string; message?: string; options?: Array<{ label?: string; url?: string; method?: string }> }
  | { type: 'tool_call'; ts: number; threadId: string; requestId: string; name: string; arguments: string }
  | { type: 'exit'; ts: number; threadId: string; code: number | null; signal?: string }
  | { type: 'error'; ts: number; threadId: string; message: string }

export type RuntimeSessionEvent = RuntimeThreadEvent

export interface CreateRuntimeThreadInput {
  threadId: string
  title: string
  /**
   * Runtime create interface shape.
   *
   * This is intentionally an execution API payload (`path`, `copy`) rather than the
   * CSS storage model. Persisted thread state should keep a container/resource URI,
   * and UI/service code can resolve that into this input shape when launching runtime.
   */
  workspace?: {
    path?: string
    copy?: boolean
  } & {
    rootPath?: string
  }
  tool?: RuntimeToolType
}

export type CreateRuntimeSessionInput = CreateRuntimeThreadInput

function isServiceMode() {
  return typeof window !== 'undefined' && !!(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__
}

async function fetchRuntimeJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || `Runtime request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function normalizeRuntimeSessionInput(input: CreateRuntimeSessionInput): CreateRuntimeSessionInput {
  const workspacePath = input.workspace?.path?.trim() || ''
  const workspaceRootPath = input.workspace?.rootPath?.trim() || ''
  const primaryPath = workspacePath || workspaceRootPath
  if (!primaryPath) {
    throw new Error('请先填写 workspace 路径。')
  }

  return {
    ...input,
    workspace: input.workspace
      ? {
        ...input.workspace,
        path: workspacePath || undefined,
        copy: input.workspace.copy === true,
        rootPath: workspaceRootPath || undefined,
      }
      : undefined,
    tool: input.tool ?? DEFAULT_RUNTIME_TOOL,
  }
}

export async function createRuntimeSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionRecord> {
  return fetchRuntimeJson<RuntimeSessionRecord>(`/api/threads/${encodeURIComponent(input.threadId)}/runtime`, {
    method: 'POST',
    body: JSON.stringify(normalizeRuntimeSessionInput(input)),
  })
}

export async function createThreadRuntimeSession(
  threadId: string,
  input: Omit<CreateRuntimeSessionInput, 'threadId'>,
): Promise<RuntimeSessionRecord> {
  return fetchRuntimeJson<RuntimeSessionRecord>(`/api/threads/${encodeURIComponent(threadId)}/runtime`, {
    method: 'POST',
    body: JSON.stringify(normalizeRuntimeSessionInput({ ...input, threadId })),
  })
}

export async function startRuntimeSession(id: string): Promise<RuntimeSessionRecord> {
  throw new Error(`Direct runtime start by id is no longer supported: ${id}`)
}

export async function startThreadRuntimeSession(threadId: string): Promise<RuntimeSessionRecord> {
  return fetchRuntimeJson<RuntimeSessionRecord>(`/api/threads/${encodeURIComponent(threadId)}/runtime/start`, { method: 'POST' })
}

export async function createAndStartRuntimeSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionRecord> {
  const created = await createThreadRuntimeSession(input.threadId, input)
  return startThreadRuntimeSession(input.threadId)
}

export function useRuntimeSession(threadId: string | null | undefined) {
  const queryClient = useQueryClient()
  const enabled = isServiceMode() && !!threadId
  const queryKey = ['runtime-session', threadId]

  const query = useQuery({
    queryKey,
    enabled,
    queryFn: async () => {
      return fetchRuntimeJson<RuntimeSessionRecord>(`/api/threads/${encodeURIComponent(threadId!)}/runtime`)
        .catch((error: unknown) => {
          if (error instanceof Error && /404/.test(error.message)) {
            return null
          }
          throw error
        })
    },
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey })
  }

  const createSession = useMutation({
    mutationFn: (input: CreateRuntimeSessionInput) => createThreadRuntimeSession(input.threadId, input),
    onSuccess: invalidate,
  })

  const startSession = useMutation({
    mutationFn: (_id: string) => startThreadRuntimeSession(threadId!),
    onSuccess: invalidate,
  })

  const pauseSession = useMutation({
    mutationFn: (_id: string) => fetchRuntimeJson<RuntimeSessionRecord>(`/api/threads/${encodeURIComponent(threadId!)}/runtime/pause`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  const resumeSession = useMutation({
    mutationFn: (_id: string) => fetchRuntimeJson<RuntimeSessionRecord>(`/api/threads/${encodeURIComponent(threadId!)}/runtime/resume`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  const stopSession = useMutation({
    mutationFn: (_id: string) => fetchRuntimeJson<RuntimeSessionRecord>(`/api/threads/${encodeURIComponent(threadId!)}/runtime/stop`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  const sendSessionMessage = useMutation({
    mutationFn: ({ text }: { id: string; text: string }) =>
      fetchRuntimeJson<RuntimeSessionRecord>(`/api/threads/${encodeURIComponent(threadId!)}/runtime/message`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
  })

  const respondToToolCall = useMutation({
    mutationFn: ({ requestId, output }: { id: string; requestId: string; output: string }) =>
      fetchRuntimeJson<RuntimeSessionRecord>(`/api/threads/${encodeURIComponent(threadId!)}/runtime/tool-calls/${encodeURIComponent(requestId)}/respond`, {
        method: 'POST',
        body: JSON.stringify({ output }),
      }),
    onSuccess: invalidate,
  })

  return {
    enabled,
    queryKey,
    runtimeSession: query.data ?? null,
    runtimeThread: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
    createSession,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    sendSessionMessage,
    respondToToolCall,
    createThread: createSession,
    startThread: startSession,
    pauseThread: pauseSession,
    resumeThread: resumeSession,
    stopThread: stopSession,
    sendMessage: sendSessionMessage,
    respondToRequest: respondToToolCall,
  }
}

export const useRuntimeThread = useRuntimeSession

export function useRuntimeSessionEvents(
  threadId: string | null | undefined,
  onEvent: (event: RuntimeSessionEvent) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled || !threadId || !isServiceMode()) {
      return
    }

    const eventSource = new EventSource(`/api/threads/${encodeURIComponent(threadId)}/runtime/events`)
    eventSource.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as RuntimeSessionEvent
        onEvent(event)
      } catch (error) {
        console.error('Parse runtime session event failed:', error)
      }
    }
    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [enabled, onEvent, threadId])
}

export const useRuntimeThreadEvents = useRuntimeSessionEvents

export async function fetchRuntimeSessionLog(threadId: string): Promise<string> {
  const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/runtime/log`)
  if (!response.ok) {
    throw new Error(`Failed to fetch runtime session log: ${response.status}`)
  }
  return response.text()
}

export const fetchRuntimeThreadLog = fetchRuntimeSessionLog

export function isRuntimeSessionMode() {
  return isServiceMode()
}

export const isRuntimeServiceMode = isRuntimeSessionMode
