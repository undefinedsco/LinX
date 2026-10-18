/**
 * LinX's file-editing tools, as the model sees them (R6-D, spec §2).
 *
 * The web chat executes these locally against the user's Pod (see
 * `apps/web/src/modules/chat/services/chatkit-local/pod-file-tools.ts`, which defines the argument
 * shapes). The server only has to
 *   1. declare them to the model (here, as a tiny stdio MCP server handed to the ACP session),
 *   2. turn a model call into a `tool_call` runtime event (the bridge below), and
 *   3. feed the client's result text back to the model on the continuation turn.
 *
 * They are "client tools": the MCP server never runs them. It forwards the call to the runner's
 * loopback bridge, which emits `tool_call` to the web client and ends the model turn; the result
 * returns through `respondToToolCall` as a continuation prompt.
 */
import * as crypto from 'crypto'
import * as http from 'http'
import type { AddressInfo } from 'net'

export interface PodFileToolDefinition {
  name: string
  /** Chinese first, English second; shown to the model. */
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required: string[]
    additionalProperties: false
  }
}

const DRAFT_RULE_ZH = '对用户已有文件的改动不会立刻生效：它会成为“未确认草稿”，由用户选择保留或撤销。'
const DRAFT_RULE_EN = 'Edits to the user\'s existing files do not take effect at once: they become unconfirmed drafts the user keeps or undoes.'

export const POD_FILE_TOOLS: readonly PodFileToolDefinition[] = [
  {
    name: 'files_create',
    description: [
      '在用户的空间里新建一个文本文件并写入内容。你新建的文件会直接写入，不是草稿。如果地址上已经有文件，请改用 files_edit。',
      'Create a new text file in the user\'s space and write its content. Files you create are written directly (not drafts). If a file already exists at that URI, use files_edit instead.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: '新文件的完整地址 / Full resource URI of the new file.' },
        content: { type: 'string', description: '文件的完整内容 / Full file content.' },
        mime_type: { type: 'string', description: '内容类型，默认 text/plain / Media type, default text/plain.' },
      },
      required: ['uri', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'files_edit',
    description: [
      `用新的完整内容替换用户的某个文件。${DRAFT_RULE_ZH}工具返回结果会说明这次是草稿还是已保留，请以结果为准如实告诉用户，不要说已经生效。`,
      `Replace a user file with new full content. ${DRAFT_RULE_EN} The tool result says whether it is a draft or kept; report exactly that and never claim the edit is live.`,
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: '要修改的文件的完整地址 / Full resource URI of the file to change.' },
        content: { type: 'string', description: '修改后的完整内容（不是差异）/ The complete new content (not a diff).' },
        summary: { type: 'string', description: '一句话说明改了什么 / One-line summary of the change.' },
      },
      required: ['uri', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'files_set_cell',
    description: [
      '修改表格（数据文档）里某一行某一列的值；若该行不存在，可加入新的一行。单元格改动直接生效，但带撤销标记，用户可以撤销。',
      'Set one cell of a table document (subject row x predicate column); with row_added it adds a new row. Cell changes take effect at once but carry an undo marker the user can use.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: '表格文档的完整地址 / Table document URI.' },
        subject: { type: 'string', description: '行的标识（资源地址）/ Row subject URI.' },
        predicate: { type: 'string', description: '列的标识（属性地址）/ Column predicate URI.' },
        previous_values: { type: 'array', items: { type: 'string' }, description: '改之前的值，用来撤销 / Values before the change, for undo.' },
        values: { type: 'array', items: { type: 'string' }, description: '新的值 / New values.' },
        row_added: { type: 'boolean', description: '这是新加的一行 / True when this adds a new row.' },
      },
      required: ['document', 'subject', 'predicate', 'values'],
      additionalProperties: false,
    },
  },
  {
    name: 'files_add_column',
    description: [
      `给表格加一列。${DRAFT_RULE_ZH}（用户授权过的情况下会直接加入，仍可撤销。）以返回结果为准。`,
      `Add a column to a table document. ${DRAFT_RULE_EN} (Under a standing user grant it is added at once, still undoable.) Trust the tool result.`,
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: '表格文档的完整地址 / Table document URI.' },
        predicate: { type: 'string', description: '新列的标识（属性地址）/ Predicate URI of the new column.' },
        label: { type: 'string', description: '列名 / Column label.' },
        value_type: { type: 'string', description: '值类型，例如 string、number / Value type, e.g. string, number.' },
      },
      required: ['document', 'predicate', 'label'],
      additionalProperties: false,
    },
  },
]

export const POD_FILE_TOOL_NAMES: readonly string[] = POD_FILE_TOOLS.map((tool) => tool.name)

export function isPodFileToolName(name: string): boolean {
  return POD_FILE_TOOL_NAMES.includes(name)
}

export const POD_FILE_TOOLS_MCP_SERVER_NAME = 'linx_files'

/** Appended to the session's system prompt. */
export const POD_FILE_TOOLS_SYSTEM_PROMPT = [
  '你可以用 files_create / files_edit / files_set_cell / files_add_column 直接修改用户空间里的文件。',
  '- 你修改用户“已有”的文件时，改动不会立刻生效：它会变成“未确认草稿”，由用户选择保留或撤销；文件在用户保留之前仍是原样。',
  '- 只有你在这次对话里新建的文件、以及表格单元格的改动会直接生效（后者带撤销标记）。用户授权过的同类改动会直接保留，但仍可撤销。',
  '- 工具返回的结果文字是准的：它写“草稿”就告诉用户“我改好了草稿，等你保留或撤销”，不要说“已经改好/已生效”。',
  '- 一次回复里只调用一个文件工具，等结果回来再继续；文件地址用用户给出的原始地址，不要编造。',
  '',
  'You can edit files in the user\'s space with files_create / files_edit / files_set_cell / files_add_column.',
  'Edits to existing user files are NOT live: they become unconfirmed drafts the user keeps or undoes. Only files you created in this chat and table cell edits take effect at once (cell edits are undoable). Treat the tool result text as the truth and never tell the user a draft is already applied. Call one file tool per reply and wait for its result.',
].join('\n')

export const POD_FILE_TOOL_PENDING_TEXT =
  '已交给用户端处理，结果会在下一条消息里给你。请就此结束这一轮：只用一句话说明你提交了什么，不要说已经改好。'

export interface PendingFileToolCall {
  name: string
  arguments: string
  /** The user message that started the turn (the next turn is stateless, so it is repeated). */
  userPrompt?: string
}

/** The continuation prompt: the client's result text must reach the model verbatim. */
export function buildToolContinuationPrompt(
  requestId: string,
  output: string,
  pending?: PendingFileToolCall,
): string {
  if (!pending) return `Continue after tool response ${requestId}:\n${output}`
  return [
    pending.userPrompt ? `用户的请求：${pending.userPrompt}` : '',
    `你刚才调用了 ${pending.name}，参数：${pending.arguments}`,
    `工具结果（以此为准，如实告诉用户；如果写的是未确认草稿，就说明是草稿、等用户保留，不要说已经生效）：\n${output}`,
    `Continue after tool response ${requestId}.`,
  ].filter(Boolean).join('\n\n')
}

// ---------------------------------------------------------------------------------------------
// Minimal stdio MCP server logic (newline-delimited JSON-RPC 2.0), transport-free for testing.
// ---------------------------------------------------------------------------------------------

type JsonRpcId = string | number | null
export interface JsonRpcMessage {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: any
}

export type ForwardToolCall = (name: string, args: Record<string, unknown>) => Promise<string>

/** Handles one MCP message; returns the response, or null for notifications. */
export async function handlePodFileToolsMcpMessage(
  message: JsonRpcMessage,
  forward: ForwardToolCall,
): Promise<Record<string, unknown> | null> {
  const id = message.id
  const hasId = id !== undefined && id !== null
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result })
  const fail = (code: number, text: string) => ({ jsonrpc: '2.0', id, error: { code, message: text } })

  switch (message.method) {
    case 'initialize':
      return ok({
        protocolVersion: typeof message.params?.protocolVersion === 'string' ? message.params.protocolVersion : '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: POD_FILE_TOOLS_MCP_SERVER_NAME, version: '1.0.0' },
      })
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({ tools: POD_FILE_TOOLS })
    case 'tools/call': {
      const name = String(message.params?.name ?? '')
      if (!isPodFileToolName(name)) return ok({ content: [{ type: 'text', text: `不认识的文件工具：${name}` }], isError: true })
      const args = message.params?.arguments && typeof message.params.arguments === 'object' ? message.params.arguments : {}
      try {
        return ok({ content: [{ type: 'text', text: await forward(name, args) }] })
      } catch (error) {
        return ok({ content: [{ type: 'text', text: `没有提交成功：${error instanceof Error ? error.message : String(error)}` }], isError: true })
      }
    }
    default:
      if (!hasId) return null // notifications (e.g. notifications/initialized)
      return fail(-32601, `Method not found: ${message.method}`)
  }
}

// ---------------------------------------------------------------------------------------------
// Loopback bridge: MCP server process -> runner. One per model turn.
// ---------------------------------------------------------------------------------------------

export interface PodFileToolCall {
  requestId: string
  name: string
  arguments: string
}

export class PodFileToolBridge {
  private server: http.Server | null = null
  readonly token = crypto.randomBytes(16).toString('hex')
  private resolveCall!: (call: PodFileToolCall) => void
  /** Resolves with the first file tool call of the turn; stays pending if there is none. */
  readonly firstCall: Promise<PodFileToolCall>
  private called = false

  constructor() {
    this.firstCall = new Promise((resolve) => { this.resolveCall = resolve })
  }

  async start(): Promise<string> {
    this.server = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.headers['x-linx-token'] !== this.token) {
        res.writeHead(403).end()
        return
      }
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as { name?: unknown; arguments?: unknown }
          const name = String(body.name ?? '')
          if (!isPodFileToolName(name)) throw new Error(`unknown tool ${name}`)
          if (this.called) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
              .end(JSON.stringify({ text: '这一轮已经提交过一个文件操作了，请等结果回来再继续。' }))
            return
          }
          this.called = true
          this.resolveCall({
            requestId: `linx-file:${crypto.randomUUID()}`,
            name,
            arguments: JSON.stringify(body.arguments ?? {}),
          })
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ text: POD_FILE_TOOL_PENDING_TEXT }))
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
            .end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
      })
    })
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => resolve())
    })
    return `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}/call`
  }

  close(): void {
    this.server?.close()
    this.server = null
  }
}

/** The ACP `agentConfig` that attaches the file tools to a session. */
export function buildPodFileToolsAgentConfig(input: {
  executorType: string
  mcpScriptPath: string
  endpoint: string
  token: string
  nodeBinary?: string
}) {
  return {
    id: 'linx-file-tools',
    displayName: 'LinX',
    systemPrompt: '',
    executorType: input.executorType,
    apiKey: '',
    // Appended to (not replacing) the runner's own system prompt.
    skillsContent: POD_FILE_TOOLS_SYSTEM_PROMPT,
    mcpServers: {
      [POD_FILE_TOOLS_MCP_SERVER_NAME]: {
        type: 'stdio' as const,
        command: input.nodeBinary ?? process.execPath,
        args: [input.mcpScriptPath],
        // Electron's binary runs as plain node with this flag.
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          LINX_FILE_TOOLS_ENDPOINT: input.endpoint,
          LINX_FILE_TOOLS_TOKEN: input.token,
        },
      },
    },
    skills: [],
    enabled: true,
  }
}
