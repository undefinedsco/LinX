import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FolderChildOperationSheet } from './FolderChildOperationSheet'

function renderSheet(onConfirm = vi.fn(), value = '') {
  render(
    <FolderChildOperationSheet
      operation={{ type: 'create-folder' }}
      value={value}
      pending={false}
      confirmDisabled={false}
      onValueChange={vi.fn()}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />,
  )
  return onConfirm
}

describe('FolderChildOperationSheet', () => {
  it('autofocuses the name input when the create-folder sheet opens', () => {
    renderSheet()
    expect(screen.getByLabelText('名称')).toHaveFocus()
  })

  it('submits the typed name on form submit (Enter)', () => {
    const onConfirm = renderSheet(vi.fn(), '项目')
    const input = screen.getByLabelText('名称') as HTMLInputElement
    fireEvent.submit(input.form!)
    expect(onConfirm).toHaveBeenCalledWith({ type: 'create-folder' }, '项目')
  })
})
