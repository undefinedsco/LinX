import type { MessageBlock } from '@/modules/chat/components/Messages/message-blocks'
import {
  MessageBlockStatus,
  MessageBlockType,
} from '@/modules/chat/components/Messages/message-blocks'
import { MessageBlockRenderer } from '@/modules/chat/components/Messages/Blocks'

const createdAt = '2026-07-20T10:00:00.000Z'

const sampleBlocks: MessageBlock[] = [
  {
    id: 'debug-thinking',
    messageId: 'debug-message',
    type: MessageBlockType.THINKING,
    status: MessageBlockStatus.SUCCESS,
    createdAt,
    content: '先读取项目结构，再对消息渲染边界进行归纳。',
    thinkingDuration: 1800,
  },
  {
    id: 'debug-tool',
    messageId: 'debug-message',
    type: MessageBlockType.TOOL,
    status: MessageBlockStatus.SUCCESS,
    createdAt: '2026-07-20T10:00:01.000Z',
    toolId: 'read-file',
    toolName: 'read_file',
    arguments: { path: 'apps/web/src/modules/chat' },
    toolStatus: 'done',
    result: '已读取 Chat 模块。',
    duration: 320,
  },
  {
    id: 'debug-text',
    messageId: 'debug-message',
    type: MessageBlockType.MAIN_TEXT,
    status: MessageBlockStatus.SUCCESS,
    createdAt: '2026-07-20T10:00:02.000Z',
    content: 'LinX 继续使用 React 与 Pod 数据层，Pi 只提供运行时事件和交互模式。',
  },
  {
    id: 'debug-image',
    messageId: 'debug-message',
    type: MessageBlockType.IMAGE,
    status: MessageBlockStatus.SUCCESS,
    createdAt: '2026-07-20T10:00:03.000Z',
    url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="240" viewBox="0 0 640 240"%3E%3Crect width="640" height="240" rx="24" fill="%237c3aed"/%3E%3Ctext x="320" y="130" text-anchor="middle" font-family="sans-serif" font-size="32" fill="white"%3ELinX renderer preview%3C/text%3E%3C/svg%3E',
  },
  {
    id: 'debug-file',
    messageId: 'debug-message',
    type: MessageBlockType.FILE,
    status: MessageBlockStatus.SUCCESS,
    createdAt: '2026-07-20T10:00:04.000Z',
    fileName: 'architecture-notes.pdf',
    fileUrl: 'https://example.com/architecture-notes.pdf',
    fileSize: 245760,
    mimeType: 'application/pdf',
  },
  {
    id: 'debug-citation',
    messageId: 'debug-message',
    type: MessageBlockType.CITATION,
    status: MessageBlockStatus.SUCCESS,
    createdAt: '2026-07-20T10:00:05.000Z',
    webSearch: {
      query: 'Pi Web UI architecture',
      results: [
        {
          title: 'Pi source repository',
          url: 'https://github.com/badlogic/pi-mono',
          snippet: 'Runtime and package structure used for the architectural comparison.',
        },
      ],
    },
    knowledge: [
      {
        id: 'linx-agent-guide',
        title: 'LinX Agent Guide',
        content: 'Pod collections remain the durable fact source.',
        source: 'docs/agent-guide.md',
      },
    ],
  },
]

export function DebugMessageBlocksPage() {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-8">
      <section className="mx-auto max-w-3xl rounded-3xl border bg-background p-5 shadow-sm sm:p-8">
        <header className="mb-6 border-b pb-5">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Developer preview</p>
          <h1 className="mt-2 text-2xl font-semibold">消息块渲染器</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            用固定数据验证共享 renderer registry；此页面不读写 Pod 数据。
          </p>
        </header>

        <div aria-label="Assistant message preview" className="rounded-2xl bg-muted/40 p-4 sm:p-6">
          <MessageBlockRenderer blocks={sampleBlocks} role="assistant" />
        </div>
      </section>
    </main>
  )
}
