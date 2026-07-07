import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FilesOperationSheet } from './FilesOperationSheet'

function renderSheet({
  confirmDisabled = false,
  inputValue = '',
  onConfirm = vi.fn(),
}: {
  confirmDisabled?: boolean
  inputValue?: string
  onConfirm?: () => void
} = {}) {
  render(
    <FilesOperationSheet
      open
      title="重命名"
      description="https://pod.example/public/readme.md"
      input={{
        label: '新名称',
        value: inputValue,
        onValueChange: vi.fn(),
      }}
      confirmLabel="重命名"
      confirmDisabled={confirmDisabled}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />,
  )

  return { onConfirm }
}

describe('FilesOperationSheet', () => {
  it('lets callers own submit readiness instead of deriving it from blank input', () => {
    const { onConfirm } = renderSheet({ confirmDisabled: false, inputValue: '' })

    const confirmButton = screen.getByRole('button', { name: '重命名' })
    expect(confirmButton).toBeEnabled()

    fireEvent.keyDown(screen.getByLabelText('新名称'), { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('honors caller-provided submit disabled state', () => {
    const { onConfirm } = renderSheet({ confirmDisabled: true, inputValue: 'readme.md' })

    const confirmButton = screen.getByRole('button', { name: '重命名' })
    expect(confirmButton).toBeDisabled()

    fireEvent.keyDown(screen.getByLabelText('新名称'), { key: 'Enter' })
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
