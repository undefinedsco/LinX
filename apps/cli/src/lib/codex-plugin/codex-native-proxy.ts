import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  normalizeCodexAppServerNotification,
  normalizeCodexAppServerRequest,
  type WatchNormalizedEvent,
  type WatchSessionRecord,
} from '@undefineds.co/models/watch'
import { appendWatchEvent, createWatchSession, finishWatchSession, writeWatchSession } from '../watch/archive.js'
import { persistWatchConversationToPod } from '../watch/pod-persistence.js'
import { createCodexAttachBridge, type CodexAttachBridgeRuntime } from './bridge.js'
import type { WatchRunOptions, WatchSpawnPlan } from '../watch/types.js'

interface WritableLike {
  write(chunk: string): unknown
}

export interface CodexNativeProxyOptions {
  cwd?: string
  model?: string
  passthroughArgs?: string[]
  listenHost?: string
  listenPort?: number
  log?: WritableLike
  runtime?: CodexAttachBridgeRuntime
  persistToPod?: typeof persistWatchConversationToPod
  spawnProcess?: typeof spawn
}

export interface CodexNativeProxy {
  readonly record: WatchSessionRecord
  readonly remoteUrl: string
  start(): Promise<void>
  startThread(): Promise<string>
  sendTurn(input: string): Promise<void>
  subscribe(listener: (event: WatchNormalizedEvent) => void): () => void
  close(): Promise<void>
}

function defaultPlan(options: CodexNativeProxyOptions): WatchSpawnPlan {
  return {
    command: 'codex',
    args: ['app-server', '--listen', 'stdio://', ...(options.passthroughArgs ?? [])],
  }
}

function appendProxyEvent(record: WatchSessionRecord, stream: 'stdout' | 'stderr' | 'system', line: string, events: WatchNormalizedEvent[] = []): void {
  appendWatchEvent(record, {
    timestamp: new Date().toISOString(),
    stream,
    line,
    events,
  })
}

function createNativeProxySession(options: CodexNativeProxyOptions): WatchSessionRecord {
  const runOptions: WatchRunOptions = {
    backend: 'codex',
    mode: 'manual',
    cwd: options.cwd ?? process.cwd(),
    model: options.model,
    prompt: undefined,
    passthroughArgs: options.passthroughArgs ?? [],
    runtime: 'local',
    transport: 'native',
    credentialSource: 'local',
    resolvedCredentialSource: 'local',
    approvalSource: 'remote',
  }

  const plan = defaultPlan(options)
  return createWatchSession(runOptions, plan)
}

function normalizeAccountReadResponse(): Record<string, unknown> {
  return {
    requiresOpenaiAuth: false,
    account: {
      type: 'apiKey',
    },
  }
}

function normalizeInitializeResponse(): Record<string, unknown> {
  return {
    codexHome: join(homedir(), '.codex'),
    platformFamily: 'unix',
    platformOs: process.platform === 'darwin' ? 'macos' : process.platform,
    userAgent: 'linx-codex-native-proxy',
  }
}

export function createCodexNativeProxy(options: CodexNativeProxyOptions = {}): CodexNativeProxy {
  const spawnProcess = options.spawnProcess ?? spawn
  const record = createNativeProxySession(options)
  const plan = defaultPlan(options)
  const host = options.listenHost ?? '127.0.0.1'
  const port = options.listenPort ?? 8787
  const remoteUrl = `ws://${host}:${port}`
  const log = options.log ?? process.stderr
  const bridge = createCodexAttachBridge(record, options.runtime)
  const persistToPod = options.persistToPod ?? persistWatchConversationToPod
  let child: ChildProcessWithoutNullStreams | null = null
  let wsServer: WebSocketServer | null = null
  let activeClient: WebSocket | null = null
  let closed = false
  let started = false
  let initialized = false
  let initializePromise: Promise<void> | null = null
  const pendingRequestMethods = new Map<string, string>()
  const pendingInternalResponses = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  let internalRequestId = 1
  const listeners = new Set<(event: WatchNormalizedEvent) => void>()
  let serverReadyResolve: (() => void) | null = null
  const serverReady = new Promise<void>((resolve) => {
    serverReadyResolve = resolve
  })

  const emitEvents = (events: WatchNormalizedEvent[]) => {
    if (events.length === 0) {
      return
    }
    for (const event of events) {
      for (const listener of listeners) {
        listener(event)
      }
    }
  }

  const writeChild = (payload: Record<string, unknown>) => {
    if (!child) {
      throw new Error('Codex app-server child is not running')
    }
    child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  const sendInternalRequest = (method: string, params: Record<string, unknown>): Promise<unknown> => {
    const id = `linx-internal-${internalRequestId++}`
    pendingRequestMethods.set(id, method)
    writeChild({
      jsonrpc: '2.0',
      id,
      method,
      params,
    })

    return new Promise((resolve, reject) => {
      pendingInternalResponses.set(id, { resolve, reject })
    })
  }

  const ensureInitialized = async (): Promise<void> => {
    if (initialized) {
      return
    }

    if (initializePromise) {
      return initializePromise
    }

    initializePromise = (async () => {
      await sendInternalRequest('initialize', {
        clientInfo: {
          name: 'linx-codex-native-proxy',
          version: '0.1.0',
        },
        capabilities: {
          experimentalApi: true,
        },
      })
      writeChild({
        jsonrpc: '2.0',
        method: 'initialized',
      })
      initialized = true
    })()

    try {
      await initializePromise
    } finally {
      initializePromise = null
    }
  }

  const sendClient = (payload: Record<string, unknown>) => {
    if (!activeClient || activeClient.readyState !== activeClient.OPEN) {
      return
    }
    activeClient.send(JSON.stringify(payload))
  }

  const handleClientRequest = async (message: Record<string, unknown>): Promise<void> => {
    const method = typeof message.method === 'string' ? message.method : ''

    if (method === 'initialize') {
      sendClient({ jsonrpc: '2.0', id: message.id, result: normalizeInitializeResponse() })
      return
    }

    if (method === 'account/read') {
      sendClient({ jsonrpc: '2.0', id: message.id, result: normalizeAccountReadResponse() })
      return
    }

    if (method === 'turn/start') {
      const params = (typeof message.params === 'object' && message.params !== null ? message.params : {}) as Record<string, unknown>
      const inputItems = Array.isArray(params.input) ? params.input : []
      const firstText = inputItems.find((item) => (
        typeof item === 'object'
        && item !== null
        && (item as Record<string, unknown>).type === 'text'
        && typeof (item as Record<string, unknown>).text === 'string'
      )) as Record<string, unknown> | undefined
      if (typeof firstText?.text === 'string') {
        appendProxyEvent(record, 'system', JSON.stringify({ type: 'user.turn', text: firstText.text }), [])
      }
    }

    if (method === 'initialized') {
      return
    }

    if (typeof message.id !== 'undefined') {
      pendingRequestMethods.set(String(message.id), method)
    }
    writeChild(message)
  }

  const handleChildMessage = async (message: Record<string, unknown>): Promise<void> => {
    const rpcResponses = await bridge.handleCodexRpcLine(JSON.stringify(message))
    if (rpcResponses.length > 0) {
      for (const response of rpcResponses) {
        sendClient(response as unknown as Record<string, unknown>)
      }
      return
    }

    if (typeof message.id !== 'undefined') {
      const pendingInternal = pendingInternalResponses.get(String(message.id))
      if (pendingInternal) {
        pendingInternalResponses.delete(String(message.id))
        if ('error' in message && message.error) {
          const detail = typeof (message.error as Record<string, unknown>).message === 'string'
            ? (message.error as Record<string, unknown>).message as string
            : JSON.stringify(message.error)
          pendingInternal.reject(new Error(detail))
        } else {
          pendingInternal.resolve(message.result)
        }
      }

      const requestMethod = pendingRequestMethods.get(String(message.id))
      if (requestMethod) {
        pendingRequestMethods.delete(String(message.id))

        if (requestMethod === 'thread/start') {
          const result = (typeof message.result === 'object' && message.result !== null ? message.result : {}) as Record<string, unknown>
          const thread = (typeof result.thread === 'object' && result.thread !== null ? result.thread : {}) as Record<string, unknown>
          if (typeof thread.id === 'string') {
            record.backendSessionId = thread.id
          }
          if (typeof result.cwd === 'string') {
            record.cwd = result.cwd
          }
          if (typeof result.model === 'string') {
            record.model = result.model
          }
          writeWatchSession(record)
        }
      }
    }

    sendClient(message)
  }

  return {
    record,
    remoteUrl,
    async start(): Promise<void> {
      if (started) {
        return
      }
      if (closed) {
        throw new Error('Codex native proxy is already closed')
      }
      started = true

      child = spawnProcess(plan.command, plan.args, {
        cwd: record.cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const activeChild = child
      activeChild.stdout.setEncoding('utf-8')
      activeChild.stderr.setEncoding('utf-8')

      let stdoutBuffer = ''
      activeChild.stdout.on('data', (chunk: string) => {
        stdoutBuffer += chunk
        let newlineIndex = stdoutBuffer.indexOf('\n')
        while (newlineIndex !== -1) {
          const line = stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, '')
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
          if (line.trim()) {
            let parsed: Record<string, unknown> | null = null
            try {
              parsed = JSON.parse(line) as Record<string, unknown>
            } catch {
              appendProxyEvent(record, 'stdout', line)
            }

            if (parsed) {
              const events = normalizeCodexAppServerNotification(parsed)
              appendProxyEvent(record, 'stdout', line, events)
              emitEvents(events)
              void handleChildMessage(parsed)
            }
          }
          newlineIndex = stdoutBuffer.indexOf('\n')
        }
      })

      activeChild.stderr.on('data', (chunk: string) => {
        const line = String(chunk).trim()
        if (line) {
          appendProxyEvent(record, 'stderr', line)
        }
      })

      activeChild.on('exit', (code, signal) => {
        const finalRecord = finishWatchSession(record, {
          status: code === 0 ? 'completed' : 'failed',
          exitCode: code,
          signal,
          error: code === 0 ? undefined : `codex app-server exited (${code ?? signal ?? 'null'})`,
        })
        writeWatchSession(finalRecord)
        void persistToPod(finalRecord).catch(() => undefined)
        if (wsServer) {
          wsServer.close()
        }
      })

      wsServer = new WebSocketServer({ host, port })
      wsServer.on('connection', (socket) => {
        activeClient = socket
        log.write(`[linx] codex native proxy connected: ${remoteUrl}\n`)

        socket.on('message', (buffer) => {
          const line = String(buffer)
          if (!line.trim()) {
            return
          }

          try {
            const parsed = JSON.parse(line) as Record<string, unknown>
            appendProxyEvent(record, 'system', line, normalizeCodexAppServerRequest(parsed))
            void handleClientRequest(parsed)
          } catch {
            appendProxyEvent(record, 'system', line)
          }
        })

        socket.on('close', () => {
          activeClient = null
        })
      })

      await new Promise<void>((resolve) => {
        wsServer?.once('listening', () => resolve())
      })

      await ensureInitialized()
      serverReadyResolve?.()
      log.write(`[linx] codex native proxy listening: ${remoteUrl}\n`)
      await serverReady
    },
    async startThread(): Promise<string> {
      await ensureInitialized()
      if (record.backendSessionId) {
        return record.backendSessionId
      }

      const result = await sendInternalRequest('thread/start', {
        cwd: record.cwd,
        model: record.model,
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      }) as Record<string, unknown>
      const thread = (typeof result.thread === 'object' && result.thread !== null ? result.thread : {}) as Record<string, unknown>
      const threadId = typeof thread.id === 'string' ? thread.id : record.backendSessionId
      if (!threadId) {
        throw new Error('Codex app-server did not return a thread id')
      }
      return threadId
    },
    async sendTurn(input: string): Promise<void> {
      await ensureInitialized()
      const threadId = await this.startThread()

      writeChild({
        jsonrpc: '2.0',
        id: `linx-turn-${Date.now()}`,
        method: 'turn/start',
        params: {
          threadId,
          input: [{ type: 'text', text: input }],
        },
      })
    },
    subscribe(listener: (event: WatchNormalizedEvent) => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async close(): Promise<void> {
      closed = true
      activeClient?.close()
      wsServer?.close()
      if (child && !child.killed) {
        child.kill()
      }
    },
  }
}
