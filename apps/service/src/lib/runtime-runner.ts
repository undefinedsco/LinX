export type RuntimeThreadStatus = 'idle' | 'active' | 'paused' | 'completed' | 'error'
export type RuntimeRunnerType = 'mock' | 'xpod-pty'
export type RuntimeToolType = 'codex' | 'claude' | 'codebuddy' | 'mock'

export interface RuntimeThreadRecord {
  id: string
  threadId: string
  title: string
  repoPath: string
  worktreePath: string
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

export interface CreateRuntimeThreadInput {
  threadId: string
  title: string
  repoPath: string
  worktreePath?: string
  runnerType?: RuntimeRunnerType
  tool?: RuntimeToolType
  baseRef?: string
  branch?: string
}

export interface RuntimeRunnerHost {
  getRecord(): RuntimeThreadRecord
  updateRecord(updates: Partial<RuntimeThreadRecord>): RuntimeThreadRecord
  emitEvent(event: RuntimeThreadEvent): void
}

export interface RuntimeRunner {
  start(): Promise<RuntimeThreadRecord>
  pause(): Promise<RuntimeThreadRecord>
  resume(): Promise<RuntimeThreadRecord>
  stop(): Promise<RuntimeThreadRecord>
  sendMessage(text: string): Promise<RuntimeThreadRecord>
  respondToToolCall(requestId: string, output: string): Promise<RuntimeThreadRecord>
}
