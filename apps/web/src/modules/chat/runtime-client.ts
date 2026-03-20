import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buildLocalWorkspaceUri, normalizeLocalWorkspacePath } from '@linx/models'

export type RuntimeThreadStatus = 'idle' | 'active' | 'paused' | 'completed' | 'error'
export type RuntimeSessionStatus = RuntimeThreadStatus
export type RuntimeRunnerType = 'mock' | 'xpod-pty'
export type RuntimeToolType = 'codex' | 'claude' | 'codebuddy' | 'mock'
export const DEFAULT_RUNTIME_TOOL: RuntimeToolType = 'codex'
export const DEFAULT_RUNTIME_BASE_REF = 'HEAD'

export interface RuntimeThreadRecord {
  id: string
  threadId: string
  workspaceUri?: string
  title: string
  repoPath: string
  folderPath: string
  runnerType: RuntimeRunnerType
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
  workspaceUri?: string
  title: string
  repoPath: string
  folderPath?: string
  runnerType?: RuntimeRunnerType
  tool?: RuntimeToolType
  baseRef?: string
  branch?: string
}

export type CreateRuntimeSessionInput = CreateRuntimeThreadInput

type SetupConfigResponse = {
  deviceId?: string
}

let cachedServiceDeviceId: string | null | undefined

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
  const repoPath = input.repoPath.trim()
  if (!repoPath) {
    throw new Error('请先填写仓库路径。')
  }

  const folderPath = input.folderPath?.trim() || repoPath
  const baseRef = input.baseRef?.trim() || DEFAULT_RUNTIME_BASE_REF
  const branch = input.branch?.trim() || undefined

  return {
    ...input,
    repoPath,
    workspaceUri: input.workspaceUri?.trim() || undefined,
    folderPath,
    tool: input.tool ?? DEFAULT_RUNTIME_TOOL,
    baseRef,
    branch,
  }
}

export async function getServiceDeviceId(): Promise<string> {
  if (cachedServiceDeviceId !== undefined) {
    if (!cachedServiceDeviceId) {
      throw new Error('当前 Linx 节点缺少 nodeId。')
    }
    return cachedServiceDeviceId
  }

  if (!isServiceMode()) {
    throw new Error('当前环境不支持本地 workspace。')
  }

  const data = await fetchRuntimeJson<SetupConfigResponse>('/api/setup/config')
  cachedServiceDeviceId = data.deviceId?.trim() || null
  if (!cachedServiceDeviceId) {
    throw new Error('请先为当前 Linx 节点配置 deviceId。')
  }
  return cachedServiceDeviceId
}

export async function resolveLocalWorkspaceUri(rootPath: string): Promise<string> {
  const nodeId = await getServiceDeviceId()
  const normalizedRootPath = normalizeLocalWorkspacePath(rootPath)
  if (!normalizedRootPath) {
    throw new Error('请先填写工作区根路径。')
  }
  return buildLocalWorkspaceUri(nodeId, normalizedRootPath)
}

export async function createRuntimeSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionRecord> {
  return fetchRuntimeJson<RuntimeSessionRecord>('/api/runtime/threads', {
    method: 'POST',
    body: JSON.stringify(normalizeRuntimeSessionInput(input)),
  })
}

export async function startRuntimeSession(id: string): Promise<RuntimeSessionRecord> {
  return fetchRuntimeJson<RuntimeSessionRecord>(`/api/runtime/threads/${id}/start`, { method: 'POST' })
}

export async function createAndStartRuntimeSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionRecord> {
  const created = await createRuntimeSession(input)
  return startRuntimeSession(created.id)
}

export async function listRuntimeSessions(threadId?: string): Promise<RuntimeSessionRecord[]> {
  const suffix = threadId ? `?threadId=${encodeURIComponent(threadId)}` : ''
  const data = await fetchRuntimeJson<{ items: RuntimeSessionRecord[] }>(`/api/runtime/threads${suffix}`)
  return data.items
}

export function useRuntimeSession(threadId: string | null | undefined) {
  const queryClient = useQueryClient()
  const enabled = isServiceMode() && !!threadId
  const queryKey = ['runtime-session', threadId]

  const query = useQuery({
    queryKey,
    enabled,
    queryFn: async () => {
      const sessions = await listRuntimeSessions(threadId!)
      return sessions[0] ?? null
    },
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey })
  }

  const createSession = useMutation({
    mutationFn: (input: CreateRuntimeSessionInput) => createRuntimeSession(input),
    onSuccess: invalidate,
  })

  const startSession = useMutation({
    mutationFn: (id: string) => startRuntimeSession(id),
    onSuccess: invalidate,
  })

  const pauseSession = useMutation({
    mutationFn: (id: string) => fetchRuntimeJson<RuntimeSessionRecord>(`/api/runtime/threads/${id}/pause`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  const resumeSession = useMutation({
    mutationFn: (id: string) => fetchRuntimeJson<RuntimeSessionRecord>(`/api/runtime/threads/${id}/resume`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  const stopSession = useMutation({
    mutationFn: (id: string) => fetchRuntimeJson<RuntimeSessionRecord>(`/api/runtime/threads/${id}/stop`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  const sendSessionMessage = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      fetchRuntimeJson<RuntimeSessionRecord>(`/api/runtime/threads/${id}/message`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
  })

  const respondToToolCall = useMutation({
    mutationFn: ({ id, requestId, output }: { id: string; requestId: string; output: string }) =>
      fetchRuntimeJson<RuntimeSessionRecord>(`/api/runtime/threads/${id}/tool-calls/${encodeURIComponent(requestId)}/respond`, {
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
  runtimeSessionId: string | null | undefined,
  onEvent: (event: RuntimeSessionEvent) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled || !runtimeSessionId || !isServiceMode()) {
      return
    }

    const eventSource = new EventSource(`/api/runtime/threads/${runtimeSessionId}/events`)
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
  }, [enabled, onEvent, runtimeSessionId])
}

export const useRuntimeThreadEvents = useRuntimeSessionEvents

export async function fetchRuntimeSessionLog(id: string): Promise<string> {
  const response = await fetch(`/api/runtime/threads/${id}/log`)
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
