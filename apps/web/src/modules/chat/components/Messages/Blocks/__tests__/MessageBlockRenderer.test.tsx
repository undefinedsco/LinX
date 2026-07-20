/**
 * CP1 Unit Tests — Message block dispatch
 *
 * Tests that MessageBlockRenderer correctly dispatches block types
 * to their corresponding components.
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MessageBlockRenderer, registerMessageBlockRenderer } from '..'
import { MessageBlockType, MessageBlockStatus } from '../../message-blocks'
import type { MessageBlock } from '../../message-blocks'

// Mock MarkdownRenderer to avoid complex markdown parsing in tests
vi.mock('../../../Markdown/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}))

function createBlock(type: MessageBlockType, extra = {}): MessageBlock {
  const base = {
    id: `block-${type}-${Date.now()}`,
    messageId: 'msg-1',
    type,
    status: MessageBlockStatus.SUCCESS,
    createdAt: new Date().toISOString(),
  }

  switch (type) {
    case MessageBlockType.MAIN_TEXT:
      return { ...base, type, content: 'Hello world' } as MessageBlock
    case MessageBlockType.THINKING:
      return { ...base, type, content: 'Let me think...', thinkingDuration: 2000 } as MessageBlock
    case MessageBlockType.TOOL:
      return {
        ...base, type,
        toolId: 'tool-1', toolName: 'read_file',
        arguments: { path: '/test' },
        toolStatus: 'done' as const,
        ...extra,
      } as MessageBlock
    case MessageBlockType.TOOL_APPROVAL:
      return {
        ...base, type,
        status: MessageBlockStatus.PENDING,
        toolCallId: 'tc-1', toolName: 'write_file',
        toolDescription: 'Write to file',
        arguments: { path: '/out' },
        risk: 'medium' as const,
        approvalStatus: 'pending' as const,
        ...extra,
      } as MessageBlock
    case MessageBlockType.TASK_PROGRESS:
      return {
        ...base, type,
        task: 'task-1', taskId: 'task-1', title: 'Deploying',
        steps: [
          { id: 's1', label: 'Build', status: 'done' as const },
          { id: 's2', label: 'Deploy', status: 'running' as const },
        ],
        currentStep: 1, totalSteps: 2,
        ...extra,
      } as MessageBlock
    case MessageBlockType.ERROR:
      return {
        ...base, type,
        status: MessageBlockStatus.ERROR,
        message: 'Something went wrong',
        retryable: true,
        ...extra,
      } as MessageBlock
    case MessageBlockType.IMAGE:
      return { ...base, type, url: 'https://example.com/image.png' } as MessageBlock
    case MessageBlockType.FILE:
      return {
        ...base, type,
        fileName: 'report.pdf', fileUrl: 'https://example.com/report.pdf',
        fileSize: 2048, mimeType: 'application/pdf',
      } as MessageBlock
    case MessageBlockType.CITATION:
      return {
        ...base, type,
        webSearch: {
          query: 'LinX',
          results: [{ title: 'LinX source', url: 'https://example.com/linx', snippet: 'Source summary' }],
        },
      } as MessageBlock
    default:
      return { ...base, type: MessageBlockType.UNKNOWN } as MessageBlock
  }
}

describe('MessageBlockRenderer — block dispatch', () => {
  it('renders MAIN_TEXT block', () => {
    const blocks = [createBlock(MessageBlockType.MAIN_TEXT)]
    render(<MessageBlockRenderer blocks={blocks} role="assistant" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders THINKING block', () => {
    const blocks = [createBlock(MessageBlockType.THINKING)]
    render(<MessageBlockRenderer blocks={blocks} role="assistant" />)
    expect(screen.getByText(/深度思考/)).toBeInTheDocument()
  })

  it('renders TOOL block', () => {
    const blocks = [createBlock(MessageBlockType.TOOL)]
    render(<MessageBlockRenderer blocks={blocks} role="assistant" />)
    expect(screen.getByText('read_file')).toBeInTheDocument()
  })

  it('renders TOOL_APPROVAL block with callbacks', () => {
    const onApprove = vi.fn()
    const onReject = vi.fn()
    const blocks = [createBlock(MessageBlockType.TOOL_APPROVAL)]

    render(
      <MessageBlockRenderer
        blocks={blocks}
        role="assistant"
        onToolApprove={onApprove}
        onToolReject={onReject}
      />
    )

    expect(screen.getByText('write_file')).toBeInTheDocument()
    expect(screen.getByText('等待审批')).toBeInTheDocument()
    expect(screen.getByText('批准')).toBeInTheDocument()
  })

  it('renders TASK_PROGRESS block', () => {
    const blocks = [createBlock(MessageBlockType.TASK_PROGRESS)]
    render(<MessageBlockRenderer blocks={blocks} role="assistant" />)
    expect(screen.getByText('Deploying')).toBeInTheDocument()
    expect(screen.getByText('Build')).toBeInTheDocument()
    expect(screen.getByText('Deploy')).toBeInTheDocument()
  })

  it('renders ERROR block', () => {
    const blocks = [createBlock(MessageBlockType.ERROR)]
    render(<MessageBlockRenderer blocks={blocks} role="assistant" />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders multiple blocks in order', () => {
    const now = Date.now()
    const blocks = [
      { ...createBlock(MessageBlockType.THINKING), createdAt: new Date(now).toISOString() },
      { ...createBlock(MessageBlockType.TOOL), createdAt: new Date(now + 1000).toISOString() },
      { ...createBlock(MessageBlockType.MAIN_TEXT), createdAt: new Date(now + 2000).toISOString() },
    ]

    render(<MessageBlockRenderer blocks={blocks} role="assistant" />)

    expect(screen.getByText(/深度思考/)).toBeInTheDocument()
    expect(screen.getByText('read_file')).toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('shows placeholder when processing with no blocks', () => {
    render(
      <MessageBlockRenderer
        blocks={[]}
        role="assistant"
        isProcessing
        messageId="msg-loading"
      />
    )
    // PlaceholderBlock renders a loading indicator
    const container = document.querySelector('.message-blocks')
    expect(container).toBeTruthy()
  })

  it('renders image, file and citation blocks without dropping rich content', () => {
    render(<MessageBlockRenderer blocks={[
      createBlock(MessageBlockType.IMAGE),
      createBlock(MessageBlockType.FILE),
      createBlock(MessageBlockType.CITATION),
    ]} role="assistant" />)

    expect(screen.getByRole('img', { name: '消息图片' })).toHaveAttribute('src', 'https://example.com/image.png')
    expect(screen.getByRole('link', { name: /report.pdf/ })).toHaveAttribute('rel', 'noreferrer noopener')
    expect(screen.getByRole('link', { name: /LinX source/ })).toHaveAttribute('target', '_blank')
    expect(screen.getByText('Source summary')).toBeInTheDocument()
  })

  it('allows a runtime adapter to override and restore a renderer', () => {
    const unregister = registerMessageBlockRenderer(MessageBlockType.IMAGE, (block) => (
      <div data-testid="custom-image">{block.id}</div>
    ))

    const image = createBlock(MessageBlockType.IMAGE)
    const first = render(<MessageBlockRenderer blocks={[image]} role="assistant" />)
    expect(screen.getByTestId('custom-image')).toHaveTextContent(image.id)

    first.unmount()
    unregister()

    render(<MessageBlockRenderer blocks={[image]} role="assistant" />)
    expect(screen.queryByTestId('custom-image')).not.toBeInTheDocument()
  })

  it('drops unsafe rich-content URLs', () => {
    const unsafeImage = { ...createBlock(MessageBlockType.IMAGE), url: 'javascript:alert(1)' } as MessageBlock
    const unsafeFile = { ...createBlock(MessageBlockType.FILE), fileUrl: 'javascript:alert(1)' } as MessageBlock
    const unsafeCitation = {
      ...createBlock(MessageBlockType.CITATION),
      webSearch: {
        query: 'unsafe',
        results: [{ title: 'Unsafe source', url: 'javascript:alert(1)' }],
      },
    } as MessageBlock

    render(<MessageBlockRenderer blocks={[unsafeImage, unsafeFile, unsafeCitation]} role="assistant" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText('Unsafe source')).not.toBeInTheDocument()
  })
})
