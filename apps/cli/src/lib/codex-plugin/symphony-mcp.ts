import { createInterface } from 'node:readline'
import { join, resolve } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  createSymphonyDeliveryUri,
  getSymphonyArchiveRelativePaths,
  normalizeSymphonyRuntimeDeliveryResult as normalizeSymphonyDeliveryResult,
  reconcileSymphonyThreadEvents,
  SYMPHONY_HOME_DIRNAME,
  type SymphonyRuntimeDeliveryResult as SymphonyDeliverySubmission,
} from '@linx/agent-runtime/symphony'

interface ReadableLike extends NodeJS.ReadableStream {}

interface WritableLike {
  write(chunk: string): unknown
}

export interface SymphonyCodexMcpServerOptions {
  input?: ReadableLike
  output?: WritableLike
  err?: WritableLike
  env?: NodeJS.ProcessEnv
}

export interface SymphonyCodexMcpServer {
  run(): Promise<number>
  handleMessage(message: Record<string, unknown>): Promise<Record<string, unknown> | null>
}

type JsonRpcId = string | number | null

type ToolDefinition = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
}

const PROTOCOL_VERSION = '2025-03-26'
const SERVER_INFO = {
  name: 'linx-symphony',
  title: 'LinX Symphony',
  version: '0.1.0',
}

export function createSymphonyCodexMcpServer(options: SymphonyCodexMcpServerOptions = {}): SymphonyCodexMcpServer {
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout
  const err = options.err ?? process.stderr
  const env = options.env ?? process.env

  async function handleMessage(message: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    if (typeof message.method !== 'string') {
      return null
    }

    const id = readJsonRpcId(message.id)
    const method = message.method
    if (method === 'notifications/initialized' || method.startsWith('notifications/')) {
      return null
    }

    try {
      if (method === 'initialize') {
        return response(id, {
          protocolVersion: readProtocolVersion(message.params) ?? PROTOCOL_VERSION,
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: SERVER_INFO,
        })
      }

      if (method === 'ping') {
        return response(id, {})
      }

      if (method === 'tools/list') {
        return response(id, {
          tools: buildToolDefinitions(),
        })
      }

      if (method === 'tools/call') {
        return response(id, await handleToolCall(readParamsObject(message.params), env))
      }

      return errorResponse(id, -32601, `Unknown MCP method: ${method}`)
    } catch (error) {
      return errorResponse(id, -32000, error instanceof Error ? error.message : String(error))
    }
  }

  return {
    handleMessage,
    async run(): Promise<number> {
      const rl = createInterface({ input, crlfDelay: Infinity })
      for await (const line of rl) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const parsed = JSON.parse(trimmed) as unknown
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
          const reply = await handleMessage(parsed as Record<string, unknown>)
          if (reply) {
            output.write(`${JSON.stringify(reply)}\n`)
          }
        } catch (error) {
          err.write(`[linx-symphony-mcp] ${error instanceof Error ? error.message : String(error)}\n`)
        }
      }
      return 0
    },
  }
}

async function handleToolCall(params: Record<string, unknown>, env: NodeJS.ProcessEnv): Promise<Record<string, unknown>> {
  const name = typeof params.name === 'string' ? params.name : ''
  const args = readParamsObject(params.arguments)
  if (name === 'delivery_status') {
    const podRoot = resolvePodMirrorRoot(args, env)
    return toolResult({
      configured: true,
      podRoot,
      instructions: 'Call submit_delivery with the final worker report before ending this Codex session.',
    })
  }

  if (name === 'validate_delivery') {
    const normalized = normalizeDeliveryFromToolArgs(args)
    return toolResult({
      valid: true,
      status: normalized.status,
      exitCode: normalized.exitCode,
      eventCount: normalized.events.length,
      hasReport: Boolean(normalized.reportText),
      autoModeSessionId: normalized.autoModeSessionId ?? null,
    })
  }

  if (name === 'submit_delivery') {
    const podRoot = resolvePodMirrorRoot(args, env)
    const normalized = normalizeDeliveryFromToolArgs(args)
    const submitted = writeDeliveryToPodMirror(args, normalized, podRoot)
    return toolResult({
      submitted: true,
      podRoot,
      ...submitted,
      status: normalized.status,
      exitCode: normalized.exitCode,
      eventCount: normalized.events.length,
      hasReport: Boolean(normalized.reportText),
      autoModeSessionId: normalized.autoModeSessionId ?? null,
    })
  }

  if (name === 'reconcile') {
    return toolResult(reconcileSymphonyThreadEvents({
      chat: readOptionalString(args.chat),
      thread: readOptionalString(args.thread),
      randomId: readOptionalString(args.randomId),
      events: readThreadReconcileEvents(args, env),
    }))
  }

  return toolResult({ error: `Unknown Symphony tool: ${name}` }, true)
}

function normalizeDeliveryFromToolArgs(args: Record<string, unknown>): SymphonyDeliverySubmission {
  const delivery = readDeliveryInput(args.delivery)
  const candidate = normalizeSymphonyDeliveryResult(
    delivery ?? {
      status: args.status,
      exitCode: args.exitCode,
      autoModeSessionId: args.autoModeSessionId,
      events: args.events,
      report: args.report,
      reportText: args.reportText,
    },
  )
  if (!candidate) {
    throw new Error('Invalid Symphony Delivery. Provide a delivery object or fields with status/events/report.')
  }
  return candidate
}

function writeDeliveryToPodMirror(
  args: Record<string, unknown>,
  normalized: SymphonyDeliverySubmission,
  podRoot: string,
): {
  deliveryUri: string
  deliveryFile: string
  reportFile?: string
  eventsFile?: string
} {
  const deliveryUri = readOptionalString(args.deliveryUri)
    ?? createSymphonyDeliveryUri({ randomId: readOptionalString(args.randomId) ?? normalized.autoModeSessionId })
  const paths = getSymphonyArchiveRelativePaths(deliveryUri, 'delivery')
  const deliveryDir = join(podRoot, SYMPHONY_HOME_DIRNAME, paths.dir)
  const deliveryFile = join(podRoot, SYMPHONY_HOME_DIRNAME, paths.file)
  const reportFile = normalized.reportText ? join(deliveryDir, 'report.md') : undefined
  const eventsFile = normalized.events.length > 0 ? join(deliveryDir, 'events.jsonl') : undefined

  mkdirSync(deliveryDir, { recursive: true })
  writeFileSync(deliveryFile, `${JSON.stringify({
    symphonyDelivery: true,
    uri: deliveryUri,
    status: normalized.status,
    exitCode: normalized.exitCode,
    ...(normalized.autoModeSessionId ? { autoModeSessionId: normalized.autoModeSessionId } : {}),
    eventCount: normalized.events.length,
    ...(reportFile ? { reportFile: relativePodMirrorPath(podRoot, reportFile) } : {}),
    ...(eventsFile ? { eventsFile: relativePodMirrorPath(podRoot, eventsFile) } : {}),
    submittedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf-8')
  if (reportFile) {
    writeFileSync(reportFile, `${normalized.reportText}\n`, 'utf-8')
  }
  if (eventsFile) {
    writeFileSync(eventsFile, `${normalized.events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf-8')
  }
  return {
    deliveryUri,
    deliveryFile,
    ...(reportFile ? { reportFile } : {}),
    ...(eventsFile ? { eventsFile } : {}),
  }
}

function readDeliveryInput(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string' && value.trim()) {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function resolvePodMirrorRoot(args: Record<string, unknown>, env: NodeJS.ProcessEnv): string {
  return resolve(
    readOptionalString(args.podRoot)
      ?? readOptionalString(env.LINX_POD_MIRROR_ROOT)
      ?? join(process.cwd(), '.pod'),
  )
}

function relativePodMirrorPath(podRoot: string, path: string): string {
  return path.startsWith(`${podRoot}/`) ? path.slice(podRoot.length + 1) : path
}

function buildToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'delivery_status',
      title: 'Delivery Status',
      description: 'Report the local Pod mirror root where Codex worker Deliveries will be written.',
      inputSchema: {
        type: 'object',
        properties: {
          podRoot: { type: 'string', description: 'Optional local Pod mirror root. Defaults to LINX_POD_MIRROR_ROOT or ./.pod.' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'validate_delivery',
      title: 'Validate Delivery',
      description: 'Validate a Symphony worker Delivery without writing it.',
      inputSchema: deliveryInputSchema(),
    },
    {
      name: 'submit_delivery',
      title: 'Submit Delivery',
      description: 'Write a Symphony worker Delivery into the local Pod mirror for later Pod sync.',
      inputSchema: {
        ...deliveryInputSchema(),
        properties: {
          ...deliveryInputSchema().properties as Record<string, unknown>,
          podRoot: { type: 'string', description: 'Optional local Pod mirror root. Defaults to LINX_POD_MIRROR_ROOT or ./.pod.' },
          deliveryUri: { type: 'string', description: 'Optional stable Delivery URI.' },
          randomId: { type: 'string', description: 'Optional stable id seed when creating a Delivery URI.' },
        },
      },
    },
    {
      name: 'reconcile',
      title: 'Reconcile',
      description: 'Run the storage-agnostic Symphony reconciler over Codex events. This is the Codex-side MCP runner; Pod writes stay in LinX/xpod adapters.',
      inputSchema: {
        type: 'object',
        properties: {
          chat: { type: 'string', description: 'Optional Chat URI or portable chat reference.' },
          thread: { type: 'string', description: 'Optional Thread URI or portable thread reference.' },
          randomId: { type: 'string', description: 'Optional stable id seed for deterministic reconciler ids.' },
          events: {
            type: 'array',
            description: 'Thread control events or redacted Codex hook events to reconcile.',
            items: { type: 'object', additionalProperties: true },
          },
          eventsPath: {
            type: 'string',
            description: 'Optional JSONL path containing redacted Codex hook events. Defaults to LINX_SYMPHONY_HOOK_EVENTS when set.',
          },
        },
        additionalProperties: false,
      },
    },
  ]
}

function deliveryInputSchema(): Record<string, unknown> & { properties: Record<string, unknown> } {
  return {
    type: 'object',
    properties: {
      delivery: {
        description: 'Full Symphony Delivery object or JSON string. Preferred when available.',
        anyOf: [{ type: 'object', additionalProperties: true }, { type: 'string' }],
      },
      status: { type: 'string', enum: ['completed', 'failed', 'success', 'succeeded', 'ok', 'failure', 'error'] },
      exitCode: { type: 'number' },
      autoModeSessionId: { type: 'string' },
      events: { type: 'array', items: { type: 'object', additionalProperties: true } },
      report: { description: 'Structured final report.', type: 'object', additionalProperties: true },
      reportText: { type: 'string' },
    },
    additionalProperties: false,
  }
}

function toolResult(structuredContent: unknown, isError = false): Record<string, unknown> {
  const text = typeof structuredContent === 'string'
    ? structuredContent
    : JSON.stringify(structuredContent, null, 2)
  return {
    content: [{ type: 'text', text }],
    structuredContent,
    isError,
  }
}

function readParamsObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readThreadReconcileEvents(
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Record<string, unknown>[] {
  const inline = readRecordArray(args.events)
  const eventsPath = readOptionalString(args.eventsPath) ?? readOptionalString(env.LINX_SYMPHONY_HOOK_EVENTS)
  if (!eventsPath) {
    return inline
  }
  return [...readJsonlRecords(eventsPath), ...inline]
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : []
}

function readJsonlRecords(path: string): Record<string, unknown>[] {
  const body = readFileSync(path, 'utf-8')
  return body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown)
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readJsonRpcId(value: unknown): JsonRpcId {
  if (typeof value === 'string' || typeof value === 'number' || value === null) {
    return value as JsonRpcId
  }
  return null
}

function readProtocolVersion(params: unknown): string | undefined {
  const object = readParamsObject(params)
  return typeof object.protocolVersion === 'string' ? object.protocolVersion : undefined
}

function response(id: JsonRpcId, result: unknown): Record<string, unknown> {
  return { jsonrpc: '2.0', id, result }
}

function errorResponse(id: JsonRpcId, code: number, message: string): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  createSymphonyCodexMcpServer().run()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      process.stderr.write(`[linx-symphony-mcp] ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
