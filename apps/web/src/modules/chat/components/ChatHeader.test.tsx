import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockToggleRightSidebar = vi.fn()
const mockSelectChat = vi.fn()
const mockUpdateChat = vi.fn()
const mockUpdateAgentProfile = vi.fn()
const mockUpdateAgentModel = vi.fn()
const mockRefreshContact = vi.fn().mockResolvedValue(undefined)
const mockRefreshAgent = vi.fn().mockResolvedValue(undefined)
const mockToast = vi.fn()
const mockUseChatStore = vi.fn()
const mockUseEntity = vi.fn()
const mockUseChatList = vi.fn()
const mockUseThreadList = vi.fn()
const mockCreateThread = vi.fn()
const mockSelectThread = vi.fn()
const mockAgentCollectionGet = vi.fn()
const mockOpenAgentMethod = vi.fn()
let conditionsRequest = 0

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub)
Element.prototype.scrollIntoView = vi.fn()

/** 执行条件 is opened from 聊天信息; the header listens for that request. */
function requestConditions(rerender: (ui: ReactNode) => void) {
  conditionsRequest += 1
  rerender(<ChatHeader />)
}

vi.mock('@/modules/my-ai/app/open-method', () => ({
  useOpenAgentMethod: () => mockOpenAgentMethod,
}))

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({
    session: {
      info: {
        webId: 'https://user.example/profile/card#me',
      },
    },
  }),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/model-selector', () => ({
  ModelSelector: ({
    value,
    onChange,
  }: {
    value?: string
    onChange?: (value: string) => void
  }) => (
    <select
      aria-label="选择模型"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="linx-lite">linx-lite</option>
      <option value="gpt-4o-mini">gpt-4o-mini</option>
      <option value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest</option>
    </select>
  ),
}))

vi.mock('@/modules/model-services/data/use-model-services', () => ({
  useModelServices: () => ({
    providers: {
      undefineds: {
        id: 'undefineds',
        name: 'LinX Platform',
        enabled: true,
        models: [{ id: 'linx-lite', name: 'LinX Lite', enabled: true, capabilities: [] }],
      },
      openai: {
        id: 'openai',
        name: 'OpenAI',
        enabled: true,
        models: [{ id: 'gpt-4o-mini', name: 'GPT-4o mini', enabled: true, capabilities: [] }],
      },
      anthropic: {
        id: 'anthropic',
        name: 'Anthropic',
        enabled: true,
        models: [{ id: 'claude-3-5-sonnet-latest', name: 'Claude', enabled: true, capabilities: [] }],
      },
    },
  }),
}))

vi.mock('@/lib/agent-providers', () => ({
  DEFAULT_LINX_PLATFORM_MODEL_ID: 'linx-lite',
  LINX_PLATFORM_PROVIDER_ID: 'undefineds',
  normalizeChatModelId: (modelId: string) => modelId === 'undefineds/linx-lite' ? 'linx-lite' : modelId,
  findAgentProviderForModel: (modelId: string) => {
    if (modelId === 'claude-3-5-sonnet-latest') return 'anthropic'
    if (modelId === 'linx-lite' || modelId === 'undefineds/linx-lite') return 'undefineds'
    return 'openai'
  },
  getAgentProviderInfo: (slug: string) => ({
    slug,
    displayName:
      slug === 'anthropic'
        ? 'Anthropic'
        : slug === 'undefineds'
          ? 'LinX Platform'
          : 'OpenAI',
    logoUrl: `${slug}.png`,
  }),
}))

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('@/modules/inbox/components/InboxBellButton', () => ({
  InboxBellButton: () => <div>InboxBellButton</div>,
}))

vi.mock('../store', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => mockUseChatStore(selector),
}))

vi.mock('../collections', () => ({
  LINX_DEFAULT_SECRETARY: {
    agentId: 'agents/__secretary__/',
    contactId: 'contacts/__secretary__',
    chatId: 'chat/__secretary__',
    title: 'AI Secretary',
  },
  isLinxDefaultSecretaryChat: (chat: { title?: string } | null | undefined) => chat?.title === 'AI Secretary',
  useChatList: () => mockUseChatList(),
  useThreadList: () => mockUseThreadList(),
  useChatMutations: () => ({
    createThread: {
      mutateAsync: mockCreateThread,
      isPending: false,
    },
    updateChat: {
      mutateAsync: mockUpdateChat,
      isPending: false,
    },
    updateAgentProfile: {
      mutateAsync: mockUpdateAgentProfile,
      isPending: false,
    },
    updateAgentModel: {
      mutateAsync: mockUpdateAgentModel,
      isPending: false,
    },
  }),
}))

vi.mock('../features/threads/useTopicStatuses', () => ({
  useTopicStatuses: () => ({
    byThread: new Map([['thread-2', { kind: 'decision', label: '等你决定', needsYou: true }]]),
    byChat: new Map(),
    runtimeByThread: new Map(),
  }),
}))

const mockSchedule = vi.fn(() => ({ schedule: null as unknown, runs: [], setAutoRun: vi.fn(), setRepeat: vi.fn() }))
vi.mock('../features/schedule/useThreadSchedule', () => ({
  useThreadSchedule: () => mockSchedule(),
}))

vi.mock('../contacts-port', () => ({
  agentCollection: {
    get: (...args: unknown[]) => mockAgentCollectionGet(...args),
  },
}))

vi.mock('../agent-runtime-location', () => ({
  readAgentAiRuntimeLocation: (metadata: any) => metadata?.linx?.aiRuntimeLocation === 'server' ? 'server' : 'client',
  describeAgentWorkspaceAccess: (runtimeLocation: 'client' | 'server') =>
    runtimeLocation === 'server'
      ? '服务端 / xpod：空间在 server 侧按本地文件夹访问。'
      : '在这台设备上运行：设备关掉时会暂停，读写你的空间仍按你的授权来。',
}))

vi.mock('../utils/chat-participants', () => ({
  getPrimaryParticipantUri: () => 'contact-iri',
}))

vi.mock('@/lib/data/use-entity', () => ({
  useEntity: (...args: unknown[]) => mockUseEntity(...args),
}))

vi.mock('@undefineds.co/models', () => ({
  extractAIConfigProviderId: (value: string) => value || null,
  extractAIConfigResourceId: (value: string) => value || null,
  normalizeAIConfigProviderId: (value: string) => value || 'openai',
  normalizeAIConfigResourceId: (value: string) => value || null,
  resolveRowId: (row: Record<string, unknown> | null | undefined) => row?.id ?? null,
  contactResource: { name: 'contact' },
  agentResource: { name: 'agent' },
  isAgentContact: (contact: { contactType?: string; rdfType?: string } | null | undefined) =>
    contact?.contactType === 'agent' || contact?.rdfType === 'https://vocab.undefineds.co/AgentContact',
}))

import { ChatHeader } from './ChatHeader'

describe('ChatHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAgentCollectionGet.mockReturnValue(undefined)

    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedChatId: 'chat-1',
      selectedThreadId: null,
      selectChat: mockSelectChat,
      selectThread: mockSelectThread,
      showRightSidebar: false,
      toggleRightSidebar: mockToggleRightSidebar,
      executionConditionsRequest: conditionsRequest,
    }))

    mockUseThreadList.mockReturnValue({ data: [] })

    mockUseChatList.mockReturnValue({
      data: [
        {
          id: 'chat-1',
          title: '代码助手',
          starred: false,
        },
      ],
    })

    mockUseEntity.mockImplementation((_resource: unknown, iri: string | null | undefined) => {
      if (iri === 'contact-iri') {
        return {
          data: {
            id: 'contact-1',
            about: 'agent-iri',
            contactType: 'agent',
          },
          refresh: mockRefreshContact,
        }
      }

      if (iri === 'agent-iri') {
        return {
          data: {
            id: 'agent-1',
            name: '助手A',
            instructions: '原提示词',
            provider: 'openai',
            model: 'gpt-4o-mini',
            metadata: {
              linx: {
                aiRuntimeLocation: 'client',
              },
            },
            avatarUrl: 'openai.png',
          },
          refresh: mockRefreshAgent,
        }
      }

      return {
        data: null,
        refresh: vi.fn(),
      }
    })
  })

  it('offers a topic switcher beside the title at every width', async () => {
    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedChatId: 'chat-1',
      selectedThreadId: 'thread-1',
      selectChat: mockSelectChat,
      selectThread: mockSelectThread,
      showRightSidebar: false,
      toggleRightSidebar: mockToggleRightSidebar,
      executionConditionsRequest: conditionsRequest,
    }))
    mockUseThreadList.mockReturnValue({
      data: [
        { id: 'thread-1', title: '比较三种工具' },
        { id: 'thread-2', title: '排班规则草稿' },
      ],
    })

    render(<ChatHeader />)

    const trigger = screen.getByRole('button', { name: '切换话题，当前：比较三种工具' })
    expect(trigger.className).not.toContain('hidden')

    fireEvent.click(trigger)
    // The switcher says which topic is waiting on you and can search topics.
    expect(await screen.findByText('等你决定')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索话题')).toBeInTheDocument()
    fireEvent.click(screen.getByText('# 排班规则草稿'))
    expect(mockSelectThread).toHaveBeenCalledWith('thread-2')
  })

  it('shows the schedule label next to a recurring topic', () => {
    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedChatId: 'chat-1',
      selectedThreadId: 'thread-1',
      selectChat: mockSelectChat,
      selectThread: mockSelectThread,
      showRightSidebar: false,
      toggleRightSidebar: mockToggleRightSidebar,
      executionConditionsRequest: conditionsRequest,
    }))
    mockSchedule.mockReturnValueOnce({ schedule: { scheduleKind: 'cron', cron: '0 9 * * 1' }, runs: [], setAutoRun: vi.fn(), setRepeat: vi.fn() })
    render(<ChatHeader />)
    expect(screen.getByText('每周一 9:00')).toBeInTheDocument()
  })

  it('returns to the chat list from the compact header', () => {
    render(<ChatHeader />)

    fireEvent.click(screen.getByRole('button', { name: '返回聊天列表' }))

    expect(mockSelectChat).toHaveBeenCalledWith(null)
  })

  it('does not expose or execute the star action for AI Secretary', () => {
    mockUseChatList.mockReturnValue({
      data: [
        {
          id: 'chat-1',
          title: 'AI Secretary',
          starred: false,
        },
      ],
    })

    render(<ChatHeader />)

    const starButton = screen.queryByTitle('收藏')
    if (starButton) fireEvent.click(starButton)

    expect({
      hasStarButton: Boolean(starButton),
      mutationCalls: mockUpdateChat.mock.calls,
    }).toEqual({
      hasStarButton: false,
      mutationCalls: [],
    })
  })

  it('leaves the right sidebar toggle to the shared page header', () => {
    render(<ChatHeader />)

    expect(screen.queryByTitle('显示设置')).not.toBeInTheDocument()
    expect(screen.queryByTitle('隐藏设置')).not.toBeInTheDocument()
    expect(screen.getByTitle('编辑助手设置：助手A')).toBeInTheDocument()
    expect(screen.queryByTitle('切换模型：gpt-4o-mini')).not.toBeInTheDocument()
  })

  it('updates agent profile from the header dialog', async () => {
    render(<ChatHeader />)

    fireEvent.click(screen.getByText('助手A'))
    fireEvent.change(screen.getByLabelText('助手名称'), { target: { value: '新的助手名' } })
    expect(screen.queryByLabelText('系统提示词')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mockUpdateAgentProfile).toHaveBeenCalledWith({
        agentId: 'agent-1',
        currentAgent: expect.objectContaining({ id: 'agent-1' }),
        name: '新的助手名',
        aiRuntimeLocation: 'client',
        chatId: 'chat-1',
        contactId: 'contact-1',
      })
    })

    expect(mockRefreshAgent).toHaveBeenCalled()
    expect(mockRefreshContact).toHaveBeenCalled()
  })

  it('sends method editing to the single editor in My AI', () => {
    render(<ChatHeader />)

    fireEvent.click(screen.getByText('助手A'))
    fireEvent.click(screen.getByRole('button', { name: '在“我的 AI”里编辑' }))

    expect(mockOpenAgentMethod).toHaveBeenCalledWith('agent-1')
    expect(mockUpdateAgentProfile).not.toHaveBeenCalled()
  })

  it('updates model from the header dialog and derives provider', async () => {
    const { rerender } = render(<ChatHeader />)

    requestConditions(rerender)
    fireEvent.change(screen.getByLabelText('选择模型'), { target: { value: 'claude-3-5-sonnet-latest' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mockUpdateAgentModel).toHaveBeenCalledWith({
        agentId: 'agent-1',
        currentAgent: expect.objectContaining({ id: 'agent-1' }),
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
      })
    })

    expect(mockRefreshAgent).toHaveBeenCalled()
    expect(mockRefreshContact).toHaveBeenCalled()
  })

  it('uses the staged Secretary agent while its physical Agent Home is settling', async () => {
    mockUseChatList.mockReturnValue({
      data: [{ id: 'chat/__secretary__', title: 'AI Secretary', starred: false }],
    })
    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedChatId: 'chat/__secretary__',
      selectChat: mockSelectChat,
      showRightSidebar: false,
      toggleRightSidebar: mockToggleRightSidebar,
      executionConditionsRequest: conditionsRequest,
    }))
    mockUseEntity.mockReturnValue({ data: null, refresh: vi.fn().mockResolvedValue(undefined) })
    mockAgentCollectionGet.mockReturnValue({
      id: 'agents/__secretary__/',
      name: 'LinX 主理人',
      provider: 'undefineds',
      model: 'linx-lite',
    })

    const { rerender } = render(<ChatHeader />)

    requestConditions(rerender)
    expect(screen.getByText('执行条件')).toBeInTheDocument()
    expect(screen.getByText(/换模型不会改变助手的名字、头像和聊天记录/)).toBeInTheDocument()
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '当前聊天没有可编辑的模型',
    }))
  })

  it('changes where the assistant runs from 执行条件, next to the model', async () => {
    const { rerender } = render(<ChatHeader />)

    fireEvent.click(screen.getByText('助手A'))
    // The profile dialog is only about the assistant itself now.
    expect(screen.queryByLabelText('在哪里运行')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    requestConditions(rerender)
    fireEvent.change(screen.getByLabelText('在哪里运行'), { target: { value: 'server' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mockUpdateAgentProfile).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-1',
        aiRuntimeLocation: 'server',
      }))
    })
  })
})
