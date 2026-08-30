import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatGenerationControl } from './ChatGenerationControl'

describe('ChatGenerationControl', () => {
  it('reuses the composer submit position while generation is active', () => {
    const onStop = vi.fn()
    const { container } = render(<ChatGenerationControl active onStop={onStop} />)

    const button = screen.getByRole('button', { name: '停止生成' })
    expect(button).toHaveClass('size-10', 'rounded-full')
    expect(container.firstChild).toHaveClass('bottom-5', 'right-7')
    expect(screen.getByText('停止生成')).toHaveClass('sr-only')
    fireEvent.click(button)
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('does not reserve space after generation ends', () => {
    const { container } = render(<ChatGenerationControl active={false} onStop={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
