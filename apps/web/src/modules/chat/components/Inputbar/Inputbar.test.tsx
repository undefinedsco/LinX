import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

import { Inputbar } from './Inputbar'
import { TooltipProvider } from '@/components/ui/tooltip'

function renderInputbar(inputbar: ReactElement) {
  return render(<TooltipProvider>{inputbar}</TooltipProvider>)
}

describe('Inputbar', () => {
  it('stops an active generation with Escape from the composer', () => {
    const onStop = vi.fn()
    renderInputbar(
      <Inputbar
        value="continue"
        onChange={vi.fn()}
        onSend={vi.fn()}
        onStop={onStop}
        isGenerating
      />,
    )

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })

    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('names the stop-generation icon button', () => {
    renderInputbar(
      <Inputbar
        value="continue"
        onChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        isGenerating
      />,
    )

    expect(screen.getByRole('button', { name: '停止生成' })).toBeInTheDocument()
  })
})
