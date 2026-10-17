import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantNotReadyCard } from './AssistantNotReadyCard'
import { clearAssistantSetupFailure, reportAssistantSetupFailure } from './assistant-setup'
import { parsePreparationPercent } from './LoginModal'

describe('login secondary states', () => {
  beforeEach(() => clearAssistantSetupFailure())

  it('shows nothing until the assistant setup fails, then offers a retry', () => {
    const { container } = render(<AssistantNotReadyCard />)
    expect(container).toBeEmptyDOMElement()
    const retry = vi.fn()
    act(() => reportAssistantSetupFailure({ detail: 'HTTP 403', retry }))
    expect(screen.getByText('LinX 助手没能准备好')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalled()
  })

  it('reads a download percentage when the desktop reports one', () => {
    expect(parsePreparationPercent({ label: '安装', detail: '下载组件 42%' })).toBe(42)
    expect(parsePreparationPercent({ label: '安装', detail: null })).toBeNull()
  })
})
