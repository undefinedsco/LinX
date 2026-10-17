import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { useState } from 'react'
import type { Attachment } from '@/lib/vendor/xpod-chatkit'

vi.mock('../../collections', () => ({
  useThreadList: () => ({ data: [] }),
  useMessageList: () => ({ data: [], refetch: vi.fn() }),
  useMessageIndex: () => ({ data: [] }),
}))

import { ConversationDialogs } from './ConversationDialogs'
import { useWorkbenchDialogs } from './workbench-dialogs'

const listed: Attachment[] = [{ id: 'a1', name: '报价.pdf', mime_type: 'application/pdf', type: 'file' } as Attachment]

function Harness({ files }: { files: Attachment[] }) {
  const runtime = useLocalRuntime({ run: async () => ({ content: [{ type: 'text', text: 'ok' }] }) })
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const localFetch = { conversation: { listAttachments: vi.fn(async () => files) }, loadAttachmentObjectUrl: vi.fn() }
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ConversationDialogs
        session={{ info: { webId: 'https://pod.example/profile#me' } } as never}
        db={null}
        podBaseUrl={null}
        localFetch={localFetch as never}
        authFetch={vi.fn() as never}
        chatId="chat-1"
        threadId="thread-1"
        sendDisabled={false}
        threadAttachments={attachments}
        setThreadAttachments={setAttachments}
        refresh={vi.fn()}
      />
    </AssistantRuntimeProvider>
  )
}

describe('ConversationDialogs 附件', () => {
  beforeEach(() => useWorkbenchDialogs.getState().close())

  it('opens the attachments dialog from 聊天信息 and lists the chat files', async () => {
    render(<Harness files={listed} />)
    expect(screen.queryByText('会话附件')).toBeNull()
    act(() => useWorkbenchDialogs.getState().open('attachments'))
    expect(await screen.findByText('会话附件')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('报价.pdf')).toBeTruthy())
  })

  it('says so when the chat has no attachments', async () => {
    render(<Harness files={[]} />)
    act(() => useWorkbenchDialogs.getState().open('attachments'))
    expect(await screen.findByText('这段聊天还没有附件')).toBeTruthy()
  })
})
