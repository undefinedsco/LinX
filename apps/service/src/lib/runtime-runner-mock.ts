import {
  type RuntimeRunner,
  type RuntimeRunnerHost,
  type RuntimeThreadRecord,
} from './runtime-runner'

function chunkText(text: string, targetChunks = 3): string[] {
  if (!text) return ['']
  const size = Math.max(1, Math.ceil(text.length / targetChunks))
  const chunks: string[] = []
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size))
  }
  return chunks.length > 0 ? chunks : [text]
}

function buildMockReply(record: RuntimeThreadRecord, text: string): string {
  return [
    `已在运行时会话中收到你的请求：${text}`,
    `当前仓库：${record.repoPath}`,
    `当前文件夹：${record.folderPath}`,
    '现在走的是 Phase 3 最小远程链路：消息经由 service 转发，回复再回写到 Pod。',
  ].join('\n')
}

function buildMockToolResponse(record: RuntimeThreadRecord, requestId: string, output: string): string {
  return [
    `已收到工具调用响应：${requestId}`,
    `运行时工具：${record.tool}`,
    `客户端输出：${output}`,
  ].join('\n')
}

export class MockRuntimeRunner implements RuntimeRunner {
  private timers: NodeJS.Timeout[] = []

  constructor(private readonly host: RuntimeRunnerHost) {}

  async start(): Promise<RuntimeThreadRecord> {
    const record = this.host.updateRecord({ status: 'active', lastError: undefined })
    this.host.emitEvent({
      type: 'meta',
      ts: Date.now(),
      threadId: record.id,
      runner: record.tool,
      workdir: record.folderPath,
    })
    this.host.emitEvent({
      type: 'status',
      ts: Date.now(),
      threadId: record.id,
      status: 'active',
    })
    return record
  }

  async pause(): Promise<RuntimeThreadRecord> {
    this.clearTimers()
    const record = this.host.updateRecord({ status: 'paused' })
    this.host.emitEvent({
      type: 'status',
      ts: Date.now(),
      threadId: record.id,
      status: 'paused',
    })
    return record
  }

  async resume(): Promise<RuntimeThreadRecord> {
    const record = this.host.updateRecord({ status: 'active' })
    this.host.emitEvent({
      type: 'status',
      ts: Date.now(),
      threadId: record.id,
      status: 'active',
    })
    return record
  }

  async stop(): Promise<RuntimeThreadRecord> {
    this.clearTimers()
    const record = this.host.updateRecord({ status: 'completed' })
    this.host.emitEvent({
      type: 'status',
      ts: Date.now(),
      threadId: record.id,
      status: 'completed',
    })
    this.host.emitEvent({
      type: 'exit',
      ts: Date.now(),
      threadId: record.id,
      code: 0,
      signal: 'SIGINT',
    })
    return record
  }

  async sendMessage(text: string): Promise<RuntimeThreadRecord> {
    const record = this.host.getRecord()
    if (record.status !== 'active') {
      throw new Error('Runtime thread is not active')
    }

    this.host.emitEvent({
      type: 'stdout',
      ts: Date.now(),
      threadId: record.id,
      text: `$ ${text}`,
    })

    this.queueAssistantReply(buildMockReply(record, text))
    return record
  }

  async respondToToolCall(requestId: string, output: string): Promise<RuntimeThreadRecord> {
    const record = this.host.getRecord()
    if (record.status !== 'active') {
      throw new Error('Runtime thread is not active')
    }

    this.host.emitEvent({
      type: 'stdout',
      ts: Date.now(),
      threadId: record.id,
      text: `[tool_response] ${requestId} ${output}`,
    })

    this.queueAssistantReply(buildMockToolResponse(record, requestId, output))
    return record
  }

  private queueAssistantReply(reply: string) {
    const chunks = chunkText(reply)
    this.clearTimers()

    this.timers = chunks.map((chunk, index) => setTimeout(() => {
      const current = this.host.getRecord()
      if (current.status !== 'active') {
        return
      }

      this.host.emitEvent({
        type: 'assistant_delta',
        ts: Date.now(),
        threadId: current.id,
        text: chunk,
      })

      if (index === chunks.length - 1) {
        this.host.emitEvent({
          type: 'assistant_done',
          ts: Date.now(),
          threadId: current.id,
          text: reply,
        })
        this.host.updateRecord({
          tokenUsage: current.tokenUsage + Math.max(32, reply.length),
        })
      }
    }, 180 * (index + 1)))
  }

  private clearTimers() {
    this.timers.forEach((timer) => clearTimeout(timer))
    this.timers = []
  }
}
