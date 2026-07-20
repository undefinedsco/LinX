import type { MessageBlock } from '@/modules/chat/components/Messages/message-blocks'
import {
  MessageBlockStatus,
  MessageBlockType,
} from '@/modules/chat/components/Messages/message-blocks'
import { MessageBlockRenderer } from '@/modules/chat/components/Messages/Blocks'
import { adaptPiMessageToBlocks } from '@/modules/chat/pi-message-adapter'

const createdAt = '2026-07-20T10:00:00.000Z'
const timestamp = Date.parse(createdAt)

function base(id: string, type: MessageBlockType, status = MessageBlockStatus.SUCCESS) {
  return { id, messageId: 'debug-message', type, status, createdAt }
}

const piConversationBlocks = [
  ...adaptPiMessageToBlocks({
    role: 'assistant',
    timestamp,
    provider: 'anthropic',
    model: 'claude-sonnet',
    stopReason: 'toolUse',
    content: [
      { type: 'thinking', thinking: '先读取项目结构，再对消息渲染边界进行归纳。' },
      { type: 'text', text: '我会先检查消息组件，再读取相关文件。' },
      { type: 'toolCall', id: 'read-file', name: 'read_file', arguments: { path: 'apps/web/src/modules/chat' } },
    ],
  }, { messageId: 'pi-assistant', thinkingDuration: 1800 }),
  ...adaptPiMessageToBlocks({
    role: 'toolResult',
    timestamp: timestamp + 100,
    toolCallId: 'read-file',
    toolName: 'read_file',
    isError: false,
    content: [{ type: 'text', text: '已读取 Chat 模块，共 14 个文件。' }],
  }, { messageId: 'pi-tool-result' }),
]

const markdownBlocks: MessageBlock[] = [{
  ...base('debug-markdown', MessageBlockType.MAIN_TEXT),
  type: MessageBlockType.MAIN_TEXT,
  content: [
    '## Markdown 格式矩阵',
    '',
    '正文包含 **粗体**、*斜体*、`inline code` 与 [安全链接](https://example.com)。',
    '',
    '> 引用内容保持清晰的层级。',
    '',
    '- 无序列表项目',
    '- 第二个列表项目',
    '',
    '1. 有序步骤一',
    '2. 有序步骤二',
    '',
    '| 能力 | 状态 |',
    '| --- | --- |',
    '| Markdown | 通过 |',
    '| Code | 通过 |',
    '',
    '```typescript',
    'const format: string = "pi-message"',
    '```',
  ].join('\n'),
}]

const stateBlocks: MessageBlock[] = [
  {
    ...base('streaming-thinking', MessageBlockType.THINKING, MessageBlockStatus.STREAMING),
    type: MessageBlockType.THINKING,
    content: '正在分析长对话中的上下文与工具结果……',
    thinkingDuration: 640,
  },
  {
    ...base('tool-running', MessageBlockType.TOOL, MessageBlockStatus.PROCESSING),
    type: MessageBlockType.TOOL,
    toolCallId: 'bash-running',
    toolId: 'bash-running',
    toolName: 'bash',
    arguments: { command: 'yarn test' },
    toolStatus: 'running',
  },
  {
    ...base('tool-error', MessageBlockType.TOOL, MessageBlockStatus.ERROR),
    type: MessageBlockType.TOOL,
    toolCallId: 'bash-error',
    toolId: 'bash-error',
    toolName: 'bash',
    arguments: { command: 'exit 1' },
    toolStatus: 'error',
    content: '命令执行失败：exit code 1',
    toolError: 'exit code 1',
    duration: 420,
  },
  {
    ...base('approval-pending', MessageBlockType.TOOL_APPROVAL, MessageBlockStatus.PENDING),
    type: MessageBlockType.TOOL_APPROVAL,
    toolCallId: 'write-config',
    toolName: 'write_file',
    toolDescription: '写入项目配置文件',
    arguments: { path: 'config.json' },
    risk: 'medium',
    approvalStatus: 'pending',
  },
  {
    ...base('task-progress', MessageBlockType.TASK_PROGRESS, MessageBlockStatus.PROCESSING),
    type: MessageBlockType.TASK_PROGRESS,
    task: 'qa-message-formats',
    title: '验证 Pi 消息格式',
    steps: [
      { id: 'adapter', label: '适配事件', status: 'done' },
      { id: 'render', label: '渲染格式', status: 'running' },
      { id: 'persist', label: '刷新恢复', status: 'pending' },
    ],
    currentStep: 1,
    totalSteps: 3,
  },
  {
    ...base('provider-error', MessageBlockType.ERROR, MessageBlockStatus.ERROR),
    type: MessageBlockType.ERROR,
    message: '模型服务暂时不可用。',
    retryable: true,
    error: { message: 'upstream_error', details: { status: 503 } },
  },
]

const artifactBlocks: MessageBlock[] = [
  {
    ...base('debug-image', MessageBlockType.IMAGE),
    type: MessageBlockType.IMAGE,
    url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="240" viewBox="0 0 640 240"%3E%3Crect width="640" height="240" rx="24" fill="%23735FC4"/%3E%3Ctext x="320" y="130" text-anchor="middle" font-family="sans-serif" font-size="32" fill="white"%3ELinX renderer preview%3C/text%3E%3C/svg%3E',
  },
  {
    ...base('debug-file', MessageBlockType.FILE),
    type: MessageBlockType.FILE,
    fileName: 'architecture-notes.pdf',
    fileUrl: 'https://example.com/architecture-notes.pdf',
    fileSize: 245760,
    mimeType: 'application/pdf',
  },
  {
    ...base('debug-citation', MessageBlockType.CITATION),
    type: MessageBlockType.CITATION,
    webSearch: {
      query: 'Pi Web UI architecture',
      results: [{
        title: 'Pi source repository',
        url: 'https://github.com/badlogic/pi-mono',
        snippet: 'Runtime and package structure used for the architectural comparison.',
      }],
    },
    knowledge: [{
      id: 'linx-agent-guide',
      title: 'LinX Agent Guide',
      content: 'Pod collections remain the durable fact source.',
      source: 'docs/agent-guide.md',
    }],
  },
]

const galleries = [
  { id: 'pi-native', title: 'Pi 原生消息序列', description: 'thinking → text → toolCall → toolResult', blocks: piConversationBlocks },
  { id: 'markdown', title: '文本与 Markdown', description: '标题、强调、引用、列表、表格、链接与代码', blocks: markdownBlocks },
  { id: 'runtime-states', title: '运行时状态', description: '流式思考、工具运行/失败、审批、进度与错误', blocks: stateBlocks },
  { id: 'artifacts', title: '附件与引用', description: '图片、文件、Web 引用与知识库引用', blocks: artifactBlocks },
]

export function DebugMessageBlocksPage() {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-8">
      <section className="mx-auto max-w-3xl rounded-2xl border bg-background p-5 sm:p-8">
        <header className="mb-6 border-b pb-5">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Developer preview</p>
          <h1 className="mt-2 text-2xl font-semibold">Pi 消息格式矩阵</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            固定数据覆盖 Pi 原生事件、Markdown、运行时状态和富媒体；此页面不读写 Pod 数据。
          </p>
        </header>

        <div className="space-y-8" aria-label="Pi message format gallery">
          {galleries.map((gallery) => (
            <section key={gallery.id} data-testid={`format-${gallery.id}`} className="min-w-0">
              <div className="mb-3">
                <h2 className="text-base font-semibold">{gallery.title}</h2>
                <p className="text-xs text-muted-foreground">{gallery.description}</p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-xl border bg-muted/30 p-3 sm:p-5">
                <MessageBlockRenderer
                  blocks={gallery.blocks}
                  role="assistant"
                  onRetry={() => undefined}
                  onToolApprove={() => undefined}
                  onToolReject={() => undefined}
                />
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}
