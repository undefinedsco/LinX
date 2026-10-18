import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAgentMethod = vi.fn()
const requestExecutionConditions = vi.fn()
const selectChat = vi.fn()
const updateChat = vi.fn().mockResolvedValue(undefined)
const deleteChat = vi.fn().mockResolvedValue(undefined)

const state = {
  selectedChatId: 'chat-1',
  selectedThreadId: 'thread-1',
  selectChat,
  requestExecutionConditions,
}
vi.mock('../store', () => ({
  useChatStore: (selector: (s: unknown) => unknown) => selector(state),
}))

const identityState: { value: any } = { value: null }
vi.mock('../features/identity/useChatIdentity', () => ({ useChatIdentity: () => identityState.value }))
vi.mock('../features/schedule/useThreadSchedule', () => ({
  useThreadSchedule: () => ({ schedule: null, runs: [], setAutoRun: vi.fn(), setRepeat: vi.fn() }),
}))
const runtimeState: { value: any } = { value: null }
vi.mock('../runtime-client', () => ({
  useRuntimeSession: () => ({ runtimeSession: runtimeState.value }),
  fetchRuntimeSessionLog: vi.fn(),
}))
vi.mock('../collections', () => ({
  useChatMutations: () => ({
    updateChat: { mutateAsync: updateChat, isPending: false },
    deleteChat: { mutateAsync: deleteChat, isPending: false },
  }),
  useMessageIndex: () => ({ data: [] }),
  useThreadList: () => ({ data: [{ id: 'thread-1', workspace: 'https://pod/ws/' }] }),
  chatOps: { getThreads: () => [{}, {}] },
  messageRowMatchesThread: () => true,
}))
vi.mock('@/providers/solid-session-context', () => ({ useSession: () => ({ session: { info: { webId: 'me', name: '林舟' } } }) }))
vi.mock('@/providers/solid-database-provider', () => ({ useSolidDatabase: () => ({ db: null }) }))
vi.mock('@/modules/my-ai/app/open-method', () => ({ useOpenAgentMethod: () => openAgentMethod }))
vi.mock('@/modules/files/features/search/file-name-search', () => ({ useOpenFileEntry: () => vi.fn() }))
vi.mock('@/modules/inbox', () => ({ GrantsView: () => <div>grants</div> }))
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/modules/contacts/domain/contact-projection', () => ({ formatModelLabel: (model?: string) => model ?? null }))

import { ChatRightSidebar } from './ChatRightSidebar'
import { useWorkbenchDialogs } from '../features/conversation/workbench-dialogs'

function identity(kind: 'assistant' | 'person' | 'group', extra: object = {}) {
  return {
    chat: { id: 'chat-1', starred: false, muted: false, participants: ['me', 'a', 'b'] },
    identity: { kind, name: kind === 'group' ? '书店活动组' : '活动小助手', avatarUrl: null, counterparts: ['a', 'b'], memberCount: 3, contact: null },
    agent: { instructions: '书店日常\n其余', model: 'gpt-4o' },
    agentId: 'agent-1',
    lookup: { find: (id: string) => ({ id, name: id === 'a' ? '周禾' : '陈一', isAssistant: false, isGroup: false }), contacts: [] },
    isSecretary: false,
    ...extra,
  }
}

describe('ChatRightSidebar (聊天信息)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtimeState.value = null
    identityState.value = identity('assistant')
  })

  it('lists the assistant rows and no topic list', () => {
    render(<ChatRightSidebar />)
    expect(screen.getByText('聊天信息')).toBeInTheDocument()
    expect(screen.getByText('做事的方法')).toBeInTheDocument()
    expect(screen.getByText('执行条件')).toBeInTheDocument()
    expect(screen.getByText('查找聊天记录')).toBeInTheDocument()
    expect(screen.getByText('删除会话…')).toBeInTheDocument()
    expect(screen.queryByText('话题列表')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('做事的方法'))
    expect(openAgentMethod).toHaveBeenCalledWith('agent-1')
    fireEvent.click(screen.getByText('执行条件'))
    expect(requestExecutionConditions).toHaveBeenCalled()
  })

  it('stars and mutes the conversation', async () => {
    render(<ChatRightSidebar />)
    fireEvent.click(screen.getByRole('switch', { name: '标星' }))
    await waitFor(() => expect(updateChat).toHaveBeenCalledWith({ id: 'chat-1', starred: true }))
    fireEvent.click(screen.getByRole('switch', { name: '免打扰' }))
    await waitFor(() => expect(updateChat).toHaveBeenCalledWith({ id: 'chat-1', muted: true }))
  })

  it('confirms before deleting the conversation', async () => {
    render(<ChatRightSidebar />)
    fireEvent.click(screen.getByText('删除会话…'))
    expect(await screen.findByText('删除“活动小助手”？')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(deleteChat).toHaveBeenCalledWith('chat-1'))
    expect(selectChat).toHaveBeenCalledWith(null)
  })

  it('never offers deleting or starring LinX 助手', () => {
    identityState.value = identity('assistant', { isSecretary: true })
    render(<ChatRightSidebar />)
    expect(screen.queryByText('删除会话…')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: '标星' })).not.toBeInTheDocument()
  })

  it('shows the 这次运行 group for a coding tool', () => {
    runtimeState.value = { id: 's1', tool: 'claude', status: 'active', tokenUsage: 0, createdAt: new Date().toISOString(), folderPath: '/x/书店网站' }
    render(<ChatRightSidebar />)
    expect(screen.getByText('这次运行')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('书店网站')).toBeInTheDocument()
    expect(screen.getByText('复制运行日志')).toBeInTheDocument()
  })

  it('shows the group variant with members, invite and 退出群聊', () => {
    identityState.value = identity('group')
    render(<ChatRightSidebar />)
    expect(screen.getByText('周禾')).toBeInTheDocument()
    expect(screen.getByLabelText('邀请')).toBeInTheDocument()
    expect(screen.getByText('群名称')).toBeInTheDocument()
    expect(screen.getByText('助手在这个群里')).toBeInTheDocument()
    expect(screen.queryByText('做事的方法')).not.toBeInTheDocument()
    expect(screen.getByText('退出群聊…')).toBeInTheDocument()
  })

  it('opens the chat dialogs from the 这段聊天 rows', () => {
    render(<ChatRightSidebar />)
    const rows: Array<[string, string]> = [
      ['项目记忆', 'project-context'], ['附件', 'attachments'], ['产物', 'artifacts'], ['素材', 'assets'], ['分享这段聊天', 'share'],
    ]
    for (const [label, dialog] of rows) {
      useWorkbenchDialogs.getState().close()
      fireEvent.click(screen.getByText(label))
      expect(useWorkbenchDialogs.getState().active).toBe(dialog)
    }
  })
})
