import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { Attachment } from '@/lib/vendor/xpod-chatkit'
import type { LocalChatKitFetch } from '../../services/chatkit-local/fetch-handler'
import { useChatAttachmentList } from './useChatAttachmentList'

const file = (id: string, extra: Partial<Attachment> = {}) => ({ id, type: 'file', name: `${id}.pdf`, mime_type: 'application/pdf', ...extra }) as Attachment

function setup(listAttachments: (chatId: string, threadId: string) => Promise<Attachment[]>) {
  const localFetch = { conversation: { listAttachments } } as unknown as LocalChatKitFetch
  return renderHook((props: { enabled: boolean; busy: boolean }) => {
    const [attachments, setAttachments] = useState<Attachment[]>([])
    useChatAttachmentList({ ...props, localFetch, chatId: 'c1', threadId: 't2', setAttachments })
    return { attachments, setAttachments }
  }, { initialProps: { enabled: false, busy: false } })
}

describe('useChatAttachmentList', () => {
  it('lists the files of every thread of the chat when the dialog opens, not before', async () => {
    const list = vi.fn(async () => [file('a'), file('b')])
    const { result, rerender } = setup(list)
    expect(list).not.toHaveBeenCalled()
    rerender({ enabled: true, busy: false })
    await waitFor(() => expect(result.current.attachments.map((entry) => entry.id)).toEqual(['a', 'b']))
    expect(list).toHaveBeenCalledWith('c1', 't2')
  })

  it('reads again after a send finishes and keeps links that were already opened', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce([file('a')])
      .mockResolvedValueOnce([file('a'), file('new')])
    const { result, rerender } = setup(list)
    rerender({ enabled: true, busy: false })
    await waitFor(() => expect(result.current.attachments).toHaveLength(1))
    result.current.setAttachments([file('a', { download_url: 'blob:opened' })])
    rerender({ enabled: true, busy: true })
    expect(list).toHaveBeenCalledTimes(1) // not while the upload is in flight
    rerender({ enabled: true, busy: false })
    await waitFor(() => expect(result.current.attachments.map((entry) => entry.id)).toEqual(['a', 'new']))
    expect(result.current.attachments[0].download_url).toBe('blob:opened')
  })
})
