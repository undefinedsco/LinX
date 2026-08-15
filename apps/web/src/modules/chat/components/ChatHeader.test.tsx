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
    chatId: 'chat/__secretary__',
    title: 'AI Secretary',
  },
  isLinxDefaultSecretaryChat: (chat: { title?: string } | null | undefined) => chat?.title === 'AI Secretary',
  useChatList: () => mockUseChatList(),
  useChatMutations: () => ({
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

vi.mock('../agent-runtime-location', () => ({
  readAgentAiRuntimeLocation: (metadata: any) => metadata?.linx?.aiRuntimeLocation === 'server' ? 'server' : 'client',
  describeAgentWorkspaceAccess: (runtimeLocation: 'client' | 'server') =>
    runtimeLocation === 'server'
      ? '服务端 / xpod：空间在 server 侧按本地文件夹访问。'
      : '客户端：通过 xpod CLI 访问空间，不把 Pod 当成本地目录。',
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

    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedChatId: 'chat-1',
      selectChat: mockSelectChat,
      showRightSidebar: false,
      toggleRightSidebar: mockToggleRightSidebar,
    }))

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

  it('updates agent profile from the header dialog', async () => {
    render(<ChatHeader />)

    fireEvent.click(screen.getByText('助手A'))
    fireEvent.change(screen.getByLabelText('助手名称'), { target: { value: '新的助手名' } })
    fireEvent.change(screen.getByLabelText('系统提示词'), { target: { value: '新的提示词' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mockUpdateAgentProfile).toHaveBeenCalledWith({
        agentId: 'agent-1',
        currentAgent: expect.objectContaining({ id: 'agent-1' }),
        name: '新的助手名',
        instructions: '新的提示词',
        aiRuntimeLocation: 'client',
        chatId: 'chat-1',
        contactId: 'contact-1',
      })
    })

    expect(mockRefreshAgent).toHaveBeenCalled()
    expect(mockRefreshContact).toHaveBeenCalled()
  })

  it('updates model from the header dialog and derives provider', async () => {
    render(<ChatHeader />)

    fireEvent.click(screen.getByText('gpt-4o-mini'))
    fireEvent.change(screen.getByLabelText('选择模型'), { target: { value: 'claude-3-5-sonnet-latest' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mockUpdateAgentModel).toHaveBeenCalledWith({
        agentId: 'agent-1',
        currentAgent: expect.objectContaining({ id: 'agent-1' }),
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        chatId: 'chat-1',
        contactId: 'contact-1',
      })
    })

    expect(mockRefreshAgent).toHaveBeenCalled()
    expect(mockRefreshContact).toHaveBeenCalled()
  })

  it('updates the agent AI runtime location from the profile dialog', async () => {
    render(<ChatHeader />)

    fireEvent.click(screen.getByText('助手A'))
    fireEvent.change(screen.getByLabelText('AI 运行位置'), { target: { value: 'server' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mockUpdateAgentProfile).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-1',
        aiRuntimeLocation: 'server',
      }))
    })
  })
})
