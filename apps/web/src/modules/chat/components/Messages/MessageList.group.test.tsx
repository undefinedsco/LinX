import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MessageList } from './MessageList'

vi.mock('../Markdown/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}))

describe('MessageList group chat rendering', () => {
  it('uses per-message senderName for group chat headers', () => {
    render(
      <TooltipProvider>
        <MessageList
          chatType="group"
          messages={[
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'I found two issues.',
              senderName: 'Codex',
              createdAt: '2026-03-18T00:00:01.000Z',
            },
          ]}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('Codex')).toBeInTheDocument()
    expect(screen.getByText('I found two issues.')).toBeInTheDocument()
  })
})
