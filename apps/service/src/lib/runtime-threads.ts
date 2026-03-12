import * as fs from 'fs'
import * as path from 'path'
import { EventEmitter } from 'events'
import {
  type CreateRuntimeThreadInput,
  type RuntimeRunner,
  type RuntimeRunnerHost,
  type RuntimeThreadEvent,
  type RuntimeThreadRecord,
} from './runtime-runner'
import { MockRuntimeRunner } from './runtime-runner-mock'
import { XpodPtyRuntimeRunner } from './xpod-chatkit-runtime'

const CONFIG_DIR = path.join(process.env.HOME || '', 'Library', 'Application Support', 'LinX')
const STORE_PATH = path.join(CONFIG_DIR, 'runtime-threads.json')
const MAX_LOG_EVENTS = 500

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

export class RuntimeThreadsModule {
  private threads = new Map<string, RuntimeThreadRecord>()
  private logs = new Map<string, RuntimeThreadEvent[]>()
  private emitters = new Map<string, EventEmitter>()
  private runners = new Map<string, RuntimeRunner>()

  constructor() {
    this.load()
  }

  private load() {
    ensureConfigDir()
    if (!fs.existsSync(STORE_PATH)) return

    try {
      const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as RuntimeThreadRecord[]
      for (const item of raw) {
        this.threads.set(item.id, item)
      }
    } catch (error) {
      console.warn('[RuntimeThreads] Failed to load store:', error)
    }
  }

  private save() {
    ensureConfigDir()
    const rows = Array.from(this.threads.values())
    fs.writeFileSync(STORE_PATH, JSON.stringify(rows, null, 2))
  }

  private getEmitter(id: string): EventEmitter {
    let emitter = this.emitters.get(id)
    if (!emitter) {
      emitter = new EventEmitter()
      this.emitters.set(id, emitter)
    }
    return emitter
  }

  private appendLog(id: string, event: RuntimeThreadEvent) {
    const current = this.logs.get(id) ?? []
    current.push(event)
    if (current.length > MAX_LOG_EVENTS) {
      current.splice(0, current.length - MAX_LOG_EVENTS)
    }
    this.logs.set(id, current)
  }

  private emitEvent(id: string, event: RuntimeThreadEvent) {
    this.appendLog(id, event)
    this.getEmitter(id).emit('event', event)
  }

  private updateThread(id: string, updates: Partial<RuntimeThreadRecord>) {
    const current = this.getThreadOrThrow(id)
    const next: RuntimeThreadRecord = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    }
    this.threads.set(id, next)
    this.save()
    return next
  }

  private getThreadOrThrow(id: string): RuntimeThreadRecord {
    const thread = this.threads.get(id)
    if (!thread) {
      throw new Error(`Runtime session not found: ${id}`)
    }
    return thread
  }

  private createRunnerHost(id: string): RuntimeRunnerHost {
    return {
      getRecord: () => this.getThreadOrThrow(id),
      updateRecord: (updates) => this.updateThread(id, updates),
      emitEvent: (event) => this.emitEvent(id, event),
    }
  }

  private createRunner(id: string): RuntimeRunner {
    const record = this.getThreadOrThrow(id)
    if (record.runnerType === 'xpod-pty') {
      return new XpodPtyRuntimeRunner(this.createRunnerHost(id))
    }
    return new MockRuntimeRunner(this.createRunnerHost(id))
  }

  private getRunner(id: string): RuntimeRunner {
    this.getThreadOrThrow(id)
    let runner = this.runners.get(id)
    if (!runner) {
      runner = this.createRunner(id)
      this.runners.set(id, runner)
    }
    return runner
  }

  listThreads(threadId?: string): RuntimeThreadRecord[] {
    const rows = Array.from(this.threads.values())
    return rows
      .filter((item) => !threadId || item.threadId === threadId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  listSessions(threadId?: string): RuntimeThreadRecord[] {
    return this.listThreads(threadId)
  }

  getThread(id: string): RuntimeThreadRecord | null {
    return this.threads.get(id) ?? null
  }

  getSession(id: string): RuntimeThreadRecord | null {
    return this.getThread(id)
  }

  getThreadByChatThread(threadId: string): RuntimeThreadRecord | null {
    return this.listThreads(threadId)[0] ?? null
  }

  getSessionByChatThread(threadId: string): RuntimeThreadRecord | null {
    return this.getThreadByChatThread(threadId)
  }

  createThread(input: CreateRuntimeThreadInput): RuntimeThreadRecord {
    const existing = this.getThreadByChatThread(input.threadId)
    if (existing) {
      return existing
    }

    const now = new Date().toISOString()
    const record: RuntimeThreadRecord = {
      id: crypto.randomUUID(),
      threadId: input.threadId,
      title: input.title,
      repoPath: input.repoPath,
      worktreePath: input.worktreePath || input.repoPath,
      runnerType: input.runnerType || 'xpod-pty',
      tool: input.tool || 'codex',
      status: 'idle',
      tokenUsage: 0,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      baseRef: input.baseRef,
      branch: input.branch,
    }

    this.threads.set(record.id, record)
    this.runners.set(record.id, this.createRunner(record.id))
    this.save()
    return record
  }

  createSession(input: CreateRuntimeThreadInput): RuntimeThreadRecord {
    return this.createThread(input)
  }

  async startThread(id: string): Promise<RuntimeThreadRecord> {
    return this.getRunner(id).start()
  }

  async startSession(id: string): Promise<RuntimeThreadRecord> {
    return this.startThread(id)
  }

  async pauseThread(id: string): Promise<RuntimeThreadRecord> {
    return this.getRunner(id).pause()
  }

  async pauseSession(id: string): Promise<RuntimeThreadRecord> {
    return this.pauseThread(id)
  }

  async resumeThread(id: string): Promise<RuntimeThreadRecord> {
    return this.getRunner(id).resume()
  }

  async resumeSession(id: string): Promise<RuntimeThreadRecord> {
    return this.resumeThread(id)
  }

  async stopThread(id: string): Promise<RuntimeThreadRecord> {
    return this.getRunner(id).stop()
  }

  async stopSession(id: string): Promise<RuntimeThreadRecord> {
    return this.stopThread(id)
  }

  async sendMessage(id: string, text: string): Promise<RuntimeThreadRecord> {
    return this.getRunner(id).sendMessage(text)
  }

  async sendSessionMessage(id: string, text: string): Promise<RuntimeThreadRecord> {
    return this.sendMessage(id, text)
  }

  async respondToToolCall(id: string, requestId: string, output: string): Promise<RuntimeThreadRecord> {
    return this.getRunner(id).respondToToolCall(requestId, output)
  }

  async respondToSessionToolCall(id: string, requestId: string, output: string): Promise<RuntimeThreadRecord> {
    return this.respondToToolCall(id, requestId, output)
  }

  getLog(id: string): string {
    const events = this.logs.get(id) ?? []
    return events
      .map((event) => {
        switch (event.type) {
          case 'assistant_delta':
            return `[assistant_delta] ${event.text}`
          case 'assistant_done':
            return `[assistant] ${event.text}`
          case 'stdout':
            return `[stdout] ${event.text}`
          case 'stderr':
            return `[stderr] ${event.text}`
          case 'error':
            return `[error] ${event.message}`
          case 'status':
            return `[status] ${event.status}`
          case 'meta':
            return `[meta] ${event.runner} @ ${event.workdir}`
          case 'auth_required':
            return `[auth_required] ${event.method} ${event.url ?? ''}`.trim()
          case 'tool_call':
            return `[tool_call] ${event.name} ${event.requestId}`
          case 'exit':
            return `[exit] code=${event.code ?? 'null'} signal=${event.signal ?? ''}`
        }
      })
      .join('\n')
  }

  getSessionLog(id: string): string {
    return this.getLog(id)
  }

  subscribe(id: string, listener: (event: RuntimeThreadEvent) => void): () => void {
    const emitter = this.getEmitter(id)
    emitter.on('event', listener)
    return () => emitter.off('event', listener)
  }

  subscribeSession(id: string, listener: (event: RuntimeThreadEvent) => void): () => void {
    return this.subscribe(id, listener)
  }
}

let instance: RuntimeThreadsModule | null = null

export function getRuntimeThreadsModule(): RuntimeThreadsModule {
  if (!instance) {
    instance = new RuntimeThreadsModule()
  }
  return instance
}

export const getRuntimeSessionsModule = getRuntimeThreadsModule
