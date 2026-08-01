import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ErrorBlock } from '../ErrorBlock'
import { MessageBlockStatus, MessageBlockType } from '../../message-blocks'

function createErrorBlock(overrides = {}) {
  return {
    id: 'block-1',
    messageId: 'msg-1',
    type: MessageBlockType.ERROR as const,
    status: MessageBlockStatus.ERROR,
    createdAt: new Date().toISOString(),
    message: '操作失败。',
    ...overrides,
  }
}

describe('ErrorBlock', () => {
  it('does not expose internal message or details in the chat UI', () => {
    const block = createErrorBlock({
      message: 'findById requires a base-relative resource id. Use findByIri(resource, iri) for full IRIs.',
      error: {
        details: {
          message: 'Failed to create Pod container http://localhost:5737/test/.data/: HTTP 500',
          stack: '/Users/ganlu/develop/linx/apps/web/src/file.ts:12',
        },
      },
    })

    render(<ErrorBlock block={block} />)

    expect(screen.getByText('LinX 初始化失败。请刷新页面；如果仍失败，请换一个空间重新登录。')).toBeInTheDocument()
    expect(screen.getByText('当前空间还没有创建完成。请回到登录方式页，重新进入后按提示创建。')).toBeInTheDocument()
    expect(screen.queryByText(/findById|localhost|HTTP 500|\/Users|file\.ts/i)).not.toBeInTheDocument()
  })
})
