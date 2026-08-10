import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatAssetLibraryDialog } from './ChatAssetLibraryDialog'
import type { ChatAsset } from '../domain/chat-asset-library'

const assets: ChatAsset[] = [
  {
    id: 'image-1',
    type: 'image',
    name: 'design.png',
    mime_type: 'image/png',
    pod_url: 'https://pod.example/.data/chat-attachments/design.png',
    createdAt: '2026-08-11T00:00:00.000Z',
  },
  {
    id: 'pdf-1',
    type: 'file',
    name: 'requirements.pdf',
    mime_type: 'application/pdf',
    pod_url: 'https://pod.example/.data/chat-attachments/requirements.pdf',
    createdAt: '2026-08-11T01:00:00.000Z',
  },
]

describe('ChatAssetLibraryDialog', () => {
  it('searches assets and reuses the same Pod resource without reuploading it', async () => {
    const onReuse = vi.fn(async () => undefined)
    const onOpenChange = vi.fn()
    const authFetch = vi.fn()
    render(<ChatAssetLibraryDialog
      open
      onOpenChange={onOpenChange}
      assets={assets}
      authFetch={authFetch as any}
      onReuse={onReuse}
    />)

    fireEvent.change(screen.getByRole('textbox', { name: '搜索会话资产' }), { target: { value: 'pdf' } })
    expect(screen.queryByText('design.png')).not.toBeInTheDocument()
    expect(screen.getByText('requirements.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '添加 requirements.pdf 到输入框' }))

    await waitFor(() => expect(onReuse).toHaveBeenCalledWith(assets[1]))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('keeps the dialog open and reports a protected Pod download failure', async () => {
    const onOpenChange = vi.fn()
    const authFetch = vi.fn(async () => new Response('', { status: 403 }))
    render(<ChatAssetLibraryDialog
      open
      onOpenChange={onOpenChange}
      assets={assets.slice(0, 1)}
      authFetch={authFetch as any}
      onReuse={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: '下载 design.png' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('资产下载失败：HTTP 403')
    expect(authFetch).toHaveBeenCalledWith(assets[0].pod_url)
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
