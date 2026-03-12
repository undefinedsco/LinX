import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockToggleRightSidebar = vi.fn()
const mockUpdateChat = vi.fn()
const mockUpdateAgentProfile = vi.fn()
const mockUpdateAgentModel = vi.fn()
const mockRefreshContact = vi.fn().mockResolvedValue(undefined)
const mockRefreshAgent = vi.fn().mockResolvedValue(undefined)
const mockToast = vi.fn()
const mockUseChatStore = vi.fn()
const mockUseEntity = vi.fn()
const mockUseChatList = vi.fn()

vi.mock('@inrupt/solid-ui-react', () => ({
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
      <option value="gpt-4o-mini">gpt-4o-mini</option>
      <option value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest</option>
    </select>
  ),
}))

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('../store', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => mockUseChatStore(selector),
}))

vi.mock('../collections', () => ({
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

vi.mock('../utils/chat-participants', () => ({
  getPrimaryParticipantUri: () => 'contact-iri',
}))

vi.mock('@/lib/data/use-entity', () => ({
  useEntity: (...args: unknown[]) => mockUseEntity(...args),
}))

vi.mock('@linx/models', () => ({
  DEFAULT_AGENT_PROVIDERS: [
    {
      slug: 'openai',
      displayName: 'OpenAI',
      models: [{ id: 'gpt-4o-mini', displayName: 'GPT-4o mini' }],
    },
    {
      slug: 'anthropic',
      displayName: 'Anthropic',
      models: [{ id: 'claude-3-5-sonnet-latest', displayName: 'Claude 3.5 Sonnet' }],
    },
  ],
  resolveRowId: (row: Record<string, unknown> | null | undefined) => row?.id ?? row?.['@id'] ?? null,
  contactTable: { name: 'contact' },
  agentTable: { name: 'agent' },
  ContactType: {
    AGENT: 'agent',
  },
  getBuiltinProvider: (slug: string) => ({
    slug,
    displayName: slug === 'anthropic' ? 'Anthropic' : 'OpenAI',
    logoUrl: `${slug}.png`,
  }),
}))

import { ChatHeader } from './ChatHeader'

describe('ChatHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedChatId: 'chat-1',
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

    mockUseEntity.mockImplementation((_table: unknown, iri: string | null | undefined) => {
      if (iri === 'contact-iri') {
        return {
          data: {
            id: 'contact-1',
            entityUri: 'agent-iri',
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

  it('updates agent profile from the header dialog', async () => {
    render(<ChatHeader />)

    fireEvent.click(screen.getByText('助手A'))
    fireEvent.change(screen.getByLabelText('助手名称'), { target: { value: '新的助手名' } })
    fireEvent.change(screen.getByLabelText('系统提示词'), { target: { value: '新的提示词' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mockUpdateAgentProfile).toHaveBeenCalledWith({
        agentId: 'agent-1',
        name: '新的助手名',
        instructions: '新的提示词',
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
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        chatId: 'chat-1',
        contactId: 'contact-1',
      })
    })

    expect(mockRefreshAgent).toHaveBeenCalled()
    expect(mockRefreshContact).toHaveBeenCalled()
  })
})
