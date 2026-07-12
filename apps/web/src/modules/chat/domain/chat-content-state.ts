export type ChatContentStateKind =
  | 'welcome'
  | 'loading'
  | 'ready'
  | 'forbidden'
  | 'timeout'
  | 'not-found'
  | 'login-required'
  | 'unavailable'

export interface ChatContentState {
  kind: ChatContentStateKind
  recoverable: boolean
}

export interface ChatContentStateInput {
  isAuthenticated?: boolean
  isLoading: boolean
  error?: unknown
  activeChat: unknown | null
  isSecretary: boolean
  hasThread?: boolean
}

type ErrorRecord = Record<string, unknown>

function asErrorRecord(value: unknown): ErrorRecord | null {
  return typeof value === 'object' && value !== null ? value as ErrorRecord : null
}

function readStatus(error: unknown, visited = new Set<unknown>()): number | null {
  if (visited.has(error)) return null
  visited.add(error)

  const record = asErrorRecord(error)
  if (!record) return null

  for (const key of ['status', 'statusCode'] as const) {
    if (typeof record[key] === 'number') return record[key]
  }

  return readStatus(record.response, visited) ?? readStatus(record.cause, visited)
}

function readErrorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`
  if (typeof error === 'string') return error

  const record = asErrorRecord(error)
  return typeof record?.message === 'string' ? record.message : ''
}

function classifyError(error: unknown): ChatContentStateKind {
  const status = readStatus(error)
  const errorText = readErrorText(error)
  const messageStatus = errorText.match(/(?:http|status(?:code)?)\s*[:=]?\s*(401|403|404|410)\b/iu)?.[1]
  const effectiveStatus = status ?? (messageStatus ? Number(messageStatus) : null)

  if (effectiveStatus === 401) return 'login-required'
  if (effectiveStatus === 403) return 'forbidden'
  if (effectiveStatus === 404 || effectiveStatus === 410) return 'not-found'
  if (/timeout|timed out|aborterror/iu.test(errorText)) return 'timeout'
  return 'unavailable'
}

function state(kind: ChatContentStateKind, recoverable = false): ChatContentState {
  return { kind, recoverable }
}

export function projectChatContentState({
  isAuthenticated = true,
  isLoading,
  error,
  activeChat,
  isSecretary,
  hasThread,
}: ChatContentStateInput): ChatContentState {
  if (!isAuthenticated) return state('login-required')
  if (error) {
    const kind = classifyError(error)
    return state(kind, kind !== 'login-required')
  }

  if (isSecretary && (activeChat === null || hasThread === false)) {
    return state('welcome')
  }

  if (isLoading) return state('loading')
  if (activeChat === null) return state('not-found', true)
  if (hasThread === false) return state('loading')

  return state('ready')
}
