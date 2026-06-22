import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  normalizeCodexAppServerNotification,
  normalizeCodexAppServerRequest,
  type AutoModeNormalizedEvent,
  type AutoModeSessionRecord,
} from '@linx/agent-runtime/auto-mode'
import { appendAutoModeEvent, createAutoModeSession, finishAutoModeSession, writeAutoModeSession } from '../auto-mode/archive.js'
import { persistAutoModeConversationToPod } from '../auto-mode/pod-persistence.js'
import { createCodexAttachBridge, type CodexAttachBridgeRuntime } from './bridge.js'
import type { AutoRunOptions, AutoModeSpawnPlan } from '../auto-mode/types.js'
import type { BackendCommandResult } from '../backend-command-router-contract.js'
import type { SessionControlManager } from '../session-control.js'

interface WritableLike {
  write(chunk: string): unknown
}

export type CodexApprovalPolicy = 'never' | 'on-request'

export interface CodexNativeProxyOptions {
  cwd?: string
  model?: string
  autoEnabled?: boolean
  codexApprovalPolicy?: CodexApprovalPolicy
  passthroughArgs?: string[]
  env?: Record<string, string>
  resolveEnv?: () => Promise<Record<string, string> | undefined>
  listenHost?: string
  listenPort?: number
  log?: WritableLike
  runtime?: CodexAttachBridgeRuntime
  persistToPod?: typeof persistAutoModeConversationToPod
  spawnProcess?: typeof spawn
}

export interface CodexNativeProxy {
  readonly record: AutoModeSessionRecord
  readonly remoteUrl: string
  start(): Promise<void>
  startThread(): Promise<string>
  sendTurn(input: string): Promise<void>
  executeCommand(input: string): Promise<BackendCommandResult>
  setAutoEnabled(enabled: boolean): Promise<void>
  setCodexApprovalPolicy(policy: CodexApprovalPolicy | undefined): Promise<void>
  setSessionControl(control: SessionControlManager): void
  setCwd(cwd: string): Promise<void>
  subscribe(listener: (event: AutoModeNormalizedEvent) => void): () => void
  close(): Promise<void>
}

function defaultPlan(options: CodexNativeProxyOptions): AutoModeSpawnPlan {
  return {
    command: 'codex',
    args: [
      'app-server',
      '--listen',
      'stdio://',
      ...codexConfigArgs(options.env),
      ...(options.passthroughArgs ?? []),
    ],
  }
}

function codexConfigArgs(env?: Record<string, string>): string[] {
  const baseUrl = env?.CODEX_BASE_URL?.trim()
  if (!baseUrl) {
    return []
  }

  return ['-c', `openai_base_url=${JSON.stringify(baseUrl)}`]
}

function appendProxyEvent(record: AutoModeSessionRecord, stream: 'stdout' | 'stderr' | 'system', line: string, events: AutoModeNormalizedEvent[] = []): void {
  appendAutoModeEvent(record, {
    timestamp: new Date().toISOString(),
    stream,
    line,
    events,
  })
}

function createNativeProxySession(options: CodexNativeProxyOptions): AutoModeSessionRecord {
  const runOptions: AutoRunOptions = {
    backend: 'codex',
    autoEnabled: options.autoEnabled === true,
    cwd: options.cwd ?? process.cwd(),
    model: options.model,
    prompt: undefined,
    passthroughArgs: options.passthroughArgs ?? [],
    runtime: 'local',
    transport: 'native',
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
  }

  const plan = defaultPlan(options)
  return createAutoModeSession(runOptions, plan)
}

function withCodexThreadDefaults(
  params: Record<string, unknown>,
  policy: CodexApprovalPolicy | undefined,
): Record<string, unknown> {
  if (!policy) {
    return params
  }

  return {
    ...params,
    approvalPolicy: policy,
  }
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
  const host = options.listenHost ?? '127.0.0.1'
  const port = options.listenPort ?? 8787
  const remoteUrl = `ws://${host}:${port}`
  const log = options.log ?? process.stderr
  const bridge = createCodexAttachBridge(record, options.runtime)
  const persistToPod = options.persistToPod ?? persistAutoModeConversationToPod
  let child: ChildProcessWithoutNullStreams | null = null
  let wsServer: WebSocketServer | null = null
  let activeClient: WebSocket | null = null
  let resolvedEnv: Record<string, string> | undefined = options.env
  let closed = false
  let started = false
  let initialized = false
  let codexApprovalPolicy = options.codexApprovalPolicy
  let initializePromise: Promise<void> | null = null
  const pendingRequestMethods = new Map<string, string>()
  const pendingInternalResponses = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  let internalRequestId = 1
  const listeners = new Set<(event: AutoModeNormalizedEvent) => void>()
  let serverReadyResolve: (() => void) | null = null
  const serverReady = new Promise<void>((resolve) => {
    serverReadyResolve = resolve
  })

  const applyForkResult = (result: Record<string, unknown>, fallbackThreadId: string): void => {
    const nextThreadId = extractThreadId(result) ?? fallbackThreadId
    record.backendSessionId = nextThreadId
    const model = typeof result.model === 'string' ? result.model : record.model
    if (model) {
      record.model = model
    }
  }

  const requestThreadStart = async (): Promise<string> => {
    const result = await sendInternalRequest('thread/start', withCodexThreadDefaults({
      cwd: record.cwd,
      model: record.model,
      sandbox: 'workspace-write',
    }, codexApprovalPolicy)) as Record<string, unknown>
    const thread = (typeof result.thread === 'object' && result.thread !== null ? result.thread : {}) as Record<string, unknown>
    const threadId = typeof thread.id === 'string' ? thread.id : record.backendSessionId
    if (!threadId) {
      throw new Error('Codex app-server did not return a thread id')
    }
    return threadId
  }

  const forkActiveThread = async (overrides: {
    cwd?: string
    autoEnabled?: boolean
    codexApprovalPolicy?: CodexApprovalPolicy
    updateAutoEnabled?: boolean
    updateCodexApprovalPolicy?: boolean
  }): Promise<void> => {
    if (!started || !record.backendSessionId) {
      if (overrides.cwd) {
        record.cwd = overrides.cwd
      }
      if (overrides.updateAutoEnabled) {
        record.autoEnabled = overrides.autoEnabled === true
        record.mode = record.autoEnabled ? 'auto' : 'off'
      }
      if (overrides.updateCodexApprovalPolicy) {
        codexApprovalPolicy = overrides.codexApprovalPolicy
      }
      writeAutoModeSession(record)
      return
    }

    await ensureInitialized()
    const currentThreadId = record.backendSessionId
    if (overrides.cwd) {
      record.cwd = overrides.cwd
    }
    if (overrides.updateAutoEnabled) {
      record.autoEnabled = overrides.autoEnabled === true
      record.mode = record.autoEnabled ? 'auto' : 'off'
    }
    if (overrides.updateCodexApprovalPolicy) {
      codexApprovalPolicy = overrides.codexApprovalPolicy
    }

    const result = await sendInternalRequest('thread/fork', withCodexThreadDefaults({
      threadId: currentThreadId,
      model: record.model,
      cwd: record.cwd,
      sandbox: 'workspace-write',
    }, codexApprovalPolicy)) as Record<string, unknown>
    applyForkResult(result, currentThreadId)
    writeAutoModeSession(record)
  }

  const emitEvents = (events: AutoModeNormalizedEvent[]) => {
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

    return new Promise((resolve, reject) => {
      pendingInternalResponses.set(id, { resolve, reject })
      try {
        writeChild({
          jsonrpc: '2.0',
          id,
          method,
          params,
        })
      } catch (error) {
        pendingInternalResponses.delete(id)
        pendingRequestMethods.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
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
    if (typeof message.method === 'string' && typeof message.id !== 'undefined') {
      const events = normalizeCodexAppServerRequest(message)
      if (events.length > 0) {
        appendProxyEvent(record, 'stdout', JSON.stringify(message), events)
        emitEvents(events)
      }

      const rpcResponses = await bridge.handleCodexRpcLine(JSON.stringify(message))
      if (rpcResponses.length > 0) {
        for (const response of rpcResponses) {
          writeChild(response as unknown as Record<string, unknown>)
        }
        return
      }
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
          writeAutoModeSession(record)
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
      resolvedEnv = {
        ...(options.env ?? {}),
        ...((await options.resolveEnv?.()) ?? {}),
      }
      const activePlan = defaultPlan({
        ...options,
        env: resolvedEnv,
      })
      record.command = activePlan.command
      record.args = [...activePlan.args]
      writeAutoModeSession(record)

      child = spawnProcess(activePlan.command, activePlan.args, {
        cwd: record.cwd,
        env: {
          ...process.env,
          ...(resolvedEnv ?? {}),
        },
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
        const finalRecord = finishAutoModeSession(record, {
          status: code === 0 ? 'completed' : 'failed',
          exitCode: code,
          signal,
          error: code === 0 ? undefined : `codex app-server exited (${code ?? signal ?? 'null'})`,
        })
        writeAutoModeSession(finalRecord)
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
      if (!started) {
        await this.start()
      }
      await ensureInitialized()
      if (record.backendSessionId) {
        return record.backendSessionId
      }

      return requestThreadStart()
    },
    async sendTurn(input: string): Promise<void> {
      const threadId = await this.startThread()

      const params: Record<string, unknown> = {
        threadId,
        input: [{ type: 'text', text: input }],
      }
      if (record.model) {
        params.model = record.model
      }

      writeChild({
        jsonrpc: '2.0',
        id: `linx-turn-${Date.now()}`,
        method: 'turn/start',
        params,
      })
    },
    async setAutoEnabled(enabled: boolean): Promise<void> {
      await forkActiveThread({
        autoEnabled: enabled,
        updateAutoEnabled: true,
      })
    },
    async setCodexApprovalPolicy(policy: CodexApprovalPolicy | undefined): Promise<void> {
      await forkActiveThread({
        codexApprovalPolicy: policy,
        updateCodexApprovalPolicy: true,
      })
    },
    setSessionControl(control: SessionControlManager): void {
      bridge.setSessionControl(control)
    },
    async setCwd(cwd: string): Promise<void> {
      await forkActiveThread({ cwd })
    },
    async executeCommand(input: string): Promise<BackendCommandResult> {
      const parsed = parseCodexBackendCommand(input)
      if (!parsed) {
        return { handled: false }
      }

      if (!started) {
        await this.start()
      }
      await ensureInitialized()

      if (parsed.name === 'help') {
        return {
          handled: true,
          clearInput: true,
          message: [
            'Codex backend commands:',
            '/commands show Codex backend commands',
            '/compact compact current Codex thread',
            '/new start a new Codex thread',
            '/rollback [turns] roll back recent turns',
            '/fork fork the current Codex thread',
            '/model <id> use a Codex model for following turns',
            '/models list Codex models',
            '/session show current Codex thread',
            '/name <name> rename current Codex thread',
          ].join('\n'),
        }
      }

      if (parsed.name === 'models') {
        const result = await sendInternalRequest('model/list', {
          limit: 20,
          includeHidden: false,
        }) as Record<string, unknown>
        return {
          handled: true,
          clearInput: true,
          message: formatCodexModelsResult(result),
        }
      }

      if (parsed.name === 'model') {
        const model = parsed.args.trim()
        if (!model) {
          return {
            handled: true,
            clearInput: true,
            message: record.model
              ? `Codex backend model: ${record.model}`
              : 'Usage: /model <model-id>',
          }
        }
        record.model = model
        writeAutoModeSession(record)
        return {
          handled: true,
          clearInput: true,
          message: `Codex backend model set to ${model} for following turns.`,
        }
      }

      if (parsed.name === 'new') {
        record.backendSessionId = undefined
        const threadId = await requestThreadStart()
        return {
          handled: true,
          clearInput: true,
          message: `Started new Codex thread ${threadId}.`,
        }
      }

      const threadId = await this.startThread()

      if (parsed.name === 'compact') {
        await sendInternalRequest('thread/compact/start', { threadId })
        return {
          handled: true,
          clearInput: true,
          message: `Compacting Codex thread ${threadId}.`,
        }
      }

      if (parsed.name === 'rollback') {
        const numTurns = parseRollbackTurns(parsed.args)
        await sendInternalRequest('thread/rollback', { threadId, numTurns })
        return {
          handled: true,
          clearInput: true,
          message: `Rolled back ${numTurns} Codex turn${numTurns === 1 ? '' : 's'}.`,
        }
      }

      if (parsed.name === 'fork') {
        const result = await sendInternalRequest('thread/fork', withCodexThreadDefaults({
          threadId,
          model: record.model,
          cwd: record.cwd,
          sandbox: 'workspace-write',
        }, codexApprovalPolicy)) as Record<string, unknown>
        applyForkResult(result, threadId)
        writeAutoModeSession(record)
        return {
          handled: true,
          clearInput: true,
          message: `Forked Codex thread ${record.backendSessionId}.`,
        }
      }

      if (parsed.name === 'session' || parsed.name === 'status') {
        const result = await sendInternalRequest('thread/read', { threadId }) as Record<string, unknown>
        return {
          handled: true,
          clearInput: true,
          message: formatCodexThreadResult(result, record),
        }
      }

      if (parsed.name === 'name') {
        const name = parsed.args.trim()
        if (!name) {
          return {
            handled: true,
            clearInput: true,
            message: 'Usage: /name <thread-name>',
          }
        }
        await sendInternalRequest('thread/name/set', { threadId, name })
        return {
          handled: true,
          clearInput: true,
          message: `Renamed Codex thread ${threadId}.`,
        }
      }

      return { handled: false }
    },
    subscribe(listener: (event: AutoModeNormalizedEvent) => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async close(): Promise<void> {
      closed = true
      activeClient?.close()
      await new Promise<void>((resolve) => {
        if (!wsServer) {
          resolve()
          return
        }
        wsServer.close(() => resolve())
      })
      if (child && !child.killed) {
        child.kill()
      }
      child?.stdin.destroy()
      child?.stdout.destroy()
      child?.stderr.destroy()
    },
  }
}

function parseCodexBackendCommand(input: string): { name: string; args: string } | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) {
    return null
  }

  const match = /^\/([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/.exec(trimmed)
  if (!match) {
    return null
  }

  const name = match[1].toLowerCase()
  const args = match[2] ?? ''
  const supported = new Set([
    'compact',
    'commands',
    'fork',
    'help',
    'model',
    'models',
    'name',
    'new',
    'rollback',
    'session',
    'status',
  ])
  return supported.has(name) ? { name: name === 'commands' ? 'help' : name, args } : null
}

function parseRollbackTurns(raw: string): number {
  const value = Number.parseInt(raw.trim() || '1', 10)
  if (!Number.isFinite(value) || value < 1) {
    return 1
  }
  return Math.min(value, 100)
}

function extractThreadId(result: Record<string, unknown>): string | undefined {
  const thread = typeof result.thread === 'object' && result.thread !== null
    ? result.thread as Record<string, unknown>
    : undefined
  return typeof thread?.id === 'string' ? thread.id : undefined
}

function formatCodexModelsResult(result: Record<string, unknown>): string {
  const rows = Array.isArray(result.data) ? result.data : []
  const names = rows
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry
      }
      if (typeof entry !== 'object' || entry === null) {
        return null
      }
      const row = entry as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id : typeof row.model === 'string' ? row.model : undefined
      if (!id) {
        return null
      }
      const marker = row.isDefault === true ? ' (default)' : ''
      return `${id}${marker}`
    })
    .filter((entry): entry is string => Boolean(entry))

  return names.length > 0
    ? `Codex models:\n${names.slice(0, 20).map((name) => `- ${name}`).join('\n')}`
    : 'Codex model list returned no models.'
}

function formatCodexThreadResult(result: Record<string, unknown>, record: AutoModeSessionRecord): string {
  const thread = typeof result.thread === 'object' && result.thread !== null
    ? result.thread as Record<string, unknown>
    : result
  const id = typeof thread.id === 'string' ? thread.id : record.backendSessionId ?? '(not started)'
  const cwd = typeof thread.cwd === 'string' ? thread.cwd : record.cwd
  const status = typeof thread.status === 'object' && thread.status !== null
    ? JSON.stringify(thread.status)
    : typeof thread.status === 'string'
      ? thread.status
      : 'unknown'
  const model = typeof result.model === 'string' ? result.model : record.model ?? '(default)'
  return [
    `Codex thread: ${id}`,
    `Status: ${status}`,
    `Model: ${model}`,
    `Workspace: ${cwd}`,
  ].join('\n')
}
