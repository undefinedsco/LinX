import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeMode = { value: true }
const runtimeSession: { value: any } = { value: null }
const mutation = { isPending: false, mutateAsync: vi.fn() }
vi.mock('../../runtime-client', () => ({
  isRuntimeSessionMode: () => runtimeMode.value,
  useRuntimeSession: () => ({
    runtimeSession: runtimeSession.value,
    refetch: vi.fn(),
    createSession: mutation,
    startSession: mutation,
    pauseSession: mutation,
    resumeSession: mutation,
    stopSession: mutation,
  }),
  useRuntimeSessionEvents: vi.fn(),
  fetchRuntimeSessionLog: vi.fn(),
  resolveLocalContainer: vi.fn(),
}))
vi.mock('../../collections', () => ({
  useChatMutations: () => ({ ensureThreadWorkspace: mutation }),
  useWorkspaceList: () => ({ data: [] }),
}))

import { RuntimeSessionToolbar } from './RuntimeSessionToolbar'
import { useWorkbenchDialogs } from '../conversation/workbench-dialogs'

describe('RuntimeSessionToolbar', () => {
  beforeEach(() => {
    runtimeMode.value = true
    runtimeSession.value = null
    useWorkbenchDialogs.getState().close()
  })

  it('renders nothing above the chat when there is no session and no error', () => {
    const { container } = render(<RuntimeSessionToolbar threadId="thread-1" threadTitle="默认话题" workspaceUri="https://pod/ws/" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the create dialog from the workbench dialog store', () => {
    render(<RuntimeSessionToolbar threadId="thread-1" threadTitle="默认话题" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => useWorkbenchDialogs.getState().open('runtime-session'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
