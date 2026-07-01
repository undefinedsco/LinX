import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SharePreview } from './SharePreview'

const cloudPreview = {
  linkUrl: 'https://cloud.undefineds.co/alice/chat/x/',
  qrPayload: 'https://cloud.undefineds.co/alice/chat/x/',
  storageLabel: '云端空间' as const,
  hint: '拥有权限的人可通过链接访问。',
  blocksShare: false as const,
}

const localPreview = {
  linkUrl: 'https://node-0000.undefineds.co/alice/chat/x/',
  qrPayload: 'https://node-0000.undefineds.co/alice/chat/x/',
  storageLabel: '本机空间' as const,
  hint: '本机空间可能离线。链接仍可创建，对方打开时会再次检测。',
  blocksShare: false as const,
}

describe('SharePreview', () => {
  it('renders Cloud link and QR action', () => {
    render(<SharePreview preview={cloudPreview} onCopy={vi.fn()} onShowQr={vi.fn()} />)

    expect(screen.getByText('分享链接')).toBeTruthy()
    expect(screen.getByText('云端空间')).toBeTruthy()
    expect(screen.getByText('拥有权限的人可通过链接访问。')).toBeTruthy()
    expect(screen.getByText('https://cloud.undefineds.co/alice/chat/x/')).toBeTruthy()
  })

  it('renders Local heartbeat hint without blocking link actions', () => {
    const onCopy = vi.fn()
    const onShowQr = vi.fn()
    render(<SharePreview preview={localPreview} onCopy={onCopy} onShowQr={onShowQr} />)

    expect(screen.getByText('本机空间')).toBeTruthy()
    expect(screen.getByText('本机空间可能离线。链接仍可创建，对方打开时会再次检测。')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '复制链接' }))
    fireEvent.click(screen.getByRole('button', { name: '二维码' }))
    expect(onCopy).toHaveBeenCalledWith(localPreview.linkUrl)
    expect(onShowQr).toHaveBeenCalledWith(localPreview.qrPayload)
  })
})
