/**
 * CP1 Unit Tests — ToolBlock status switching
 *
 * Tests real-time status updates, spinner animation, args summary, and duration display.
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ToolBlock } from '../ToolBlock'
import { MessageBlockType, MessageBlockStatus } from '../../message-blocks'

function createToolBlock(overrides = {}) {
  return {
    id: 'block-1',
    messageId: 'msg-1',
    type: MessageBlockType.TOOL as const,
    status: MessageBlockStatus.PROCESSING,
    createdAt: new Date().toISOString(),
    toolId: 'tool-read-file',
    toolName: 'read_file',
    arguments: { path: '/tmp/test.txt' },
    ...overrides,
  }
}

describe('ToolBlock', () => {
  it('renders tool name', () => {
    const block = createToolBlock()
    render(<ToolBlock block={block} />)
    expect(screen.getByText('read_file')).toBeInTheDocument()
  })

  it('shows calling status with spinner text', () => {
    const block = createToolBlock({ toolStatus: 'calling' })
    render(<ToolBlock block={block} />)
    expect(screen.getByText('调用中...')).toBeInTheDocument()
  })

  it('shows running status', () => {
    const block = createToolBlock({ toolStatus: 'running' })
    render(<ToolBlock block={block} />)
    expect(screen.getByText('运行中...')).toBeInTheDocument()
  })

  it('shows done status', () => {
    const block = createToolBlock({
      status: MessageBlockStatus.SUCCESS,
      toolStatus: 'done',
    })
    render(<ToolBlock block={block} />)
    expect(screen.getByText('完成')).toBeInTheDocument()
  })

  it('shows error status', () => {
    const block = createToolBlock({
      status: MessageBlockStatus.ERROR,
      toolStatus: 'error',
    })
    render(<ToolBlock block={block} />)
    expect(screen.getByText('失败')).toBeInTheDocument()
  })

  it('shows waiting_approval status', () => {
    const block = createToolBlock({ toolStatus: 'waiting_approval' })
    render(<ToolBlock block={block} />)
    expect(screen.getByText('等待审批')).toBeInTheDocument()
  })

  it('displays duration when provided', () => {
    const block = createToolBlock({
      status: MessageBlockStatus.SUCCESS,
      toolStatus: 'done',
      duration: 1500,
    })
    render(<ToolBlock block={block} />)
    expect(screen.getByText('1.5s')).toBeInTheDocument()
  })

  it('displays duration in ms for short calls', () => {
    const block = createToolBlock({
      status: MessageBlockStatus.SUCCESS,
      toolStatus: 'done',
      duration: 250,
    })
    render(<ToolBlock block={block} />)
    expect(screen.getByText('250ms')).toBeInTheDocument()
  })

  it('shows args summary when collapsed', () => {
    const block = createToolBlock({
      arguments: { path: '/tmp/test.txt' },
    })
    render(<ToolBlock block={block} />)
    // Args summary should be visible in collapsed state
    expect(screen.getByText(/path:/)).toBeInTheDocument()
  })

  it('shows MCP badge when isMcp metadata is set', () => {
    const block = createToolBlock({
      metadata: { isMcp: true, mcpServer: 'filesystem' },
    })
    render(<ToolBlock block={block} />)
    expect(screen.getByText('MCP')).toBeInTheDocument()
  })

  it('does not show MCP badge when not MCP', () => {
    const block = createToolBlock({ metadata: {} })
    render(<ToolBlock block={block} />)
    expect(screen.queryByText('MCP')).not.toBeInTheDocument()
  })

  it('shows error block content when in error state', () => {
    const block = createToolBlock({
      status: MessageBlockStatus.ERROR,
      toolStatus: 'error',
      error: { message: 'File not found' },
    })
    render(<ToolBlock block={block} defaultExpanded />)
    expect(screen.getByText('File not found')).toBeInTheDocument()
  })

  it('does not expose internal tool errors in the chat UI', () => {
    const block = createToolBlock({
      status: MessageBlockStatus.ERROR,
      toolStatus: 'error',
      content: 'Failed to create Pod container https://id.undefineds.co/alice/agents/__secretary__/: HTTP 403',
      error: {
        message: "Cannot find module 'jsonld'\nRequire stack:\n- /Users/ganlu/Library/Application Support/@linx/xpod.js",
      },
    })

    render(<ToolBlock block={block} defaultExpanded />)

    expect(screen.getByText('这个账号还不能写入当前空间。请换一个空间；如果这是你的本机空间，请先完成空间创建。')).toBeInTheDocument()
    expect(screen.getByText('本机空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本机空间设置修复。')).toBeInTheDocument()
    expect(screen.queryByText(/HTTP 403|jsonld|Application Support|__secretary__|Require stack/i)).not.toBeInTheDocument()
  })
})
