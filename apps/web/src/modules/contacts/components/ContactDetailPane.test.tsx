import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

// --- Mocks must be hoisted ---

// Mock navigate
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

// Mock chat store
const mockChatStore = {
  selectChat: vi.fn(),
}

vi.mock('@/modules/chat/store', () => ({
  useChatStore: (selector: (state: typeof mockChatStore) => unknown) => selector(mockChatStore),
}))

// Mock service
const mockMutations = {
  create: { mutateAsync: vi.fn().mockResolvedValue({ id: 'test-id', '@id': '/.data/contacts/test-id.ttl' }) },
  update: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
  remove: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
}

const mockAgentMutations = {
  create: { mutateAsync: vi.fn().mockResolvedValue({ id: 'agent-id', '@id': '/.data/agents/agent-id.ttl' }) },
  update: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
}

vi.mock('../service', () => ({
  useContactService: () => ({
    useDetail: vi.fn().mockReturnValue({ data: null, isLoading: false }),
    useAgent: vi.fn().mockReturnValue({ data: null }),
    mutations: mockMutations,
    agentMutations: mockAgentMutations,
  }),
}))

// Store state - will be updated in tests  
let mockStoreState: {
  selectedId: string | null,
  viewMode: string,
  select: ReturnType<typeof vi.fn>,
  clearNewFriends: ReturnType<typeof vi.fn>,
  cancelEdit: ReturnType<typeof vi.fn>,
}

// Need to reset state before mock is called
const getInitialState = () => ({
  selectedId: null as string | null,
  viewMode: 'view' as string,
  select: vi.fn(),
  clearNewFriends: vi.fn(),
  cancelEdit: vi.fn(),
})

mockStoreState = getInitialState()

vi.mock('../store', () => ({
  useContactStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}))

// Import after mocks
import { ContactDetailPane } from './ContactDetailPane'

// Wrapper for React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('ContactDetailPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Create fresh state for each test
    Object.assign(mockStoreState, getInitialState())
  })

  describe('Empty State', () => {
    it('shows placeholder when no contact is selected', () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('选择联系人查看详情')).toBeInTheDocument()
    })
  })

  describe('New Friends View', () => {
    it('renders new friends view when viewMode is new-friends', () => {
      mockStoreState.viewMode = 'new-friends'
      
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('新的朋友')).toBeInTheDocument()
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument()
      expect(screen.getByText('李明')).toBeInTheDocument()
    })

    it('shows accept and ignore buttons for friend requests', () => {
      mockStoreState.viewMode = 'new-friends'
      
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getAllByText('接受').length).toBe(2)
      expect(screen.getAllByText('忽略').length).toBe(2)
    })

    it('calls clearNewFriends when accepting a friend', () => {
      mockStoreState.viewMode = 'new-friends'
      
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      const acceptButtons = screen.getAllByText('接受')
      fireEvent.click(acceptButtons[0])
      
      expect(mockStoreState.clearNewFriends).toHaveBeenCalled()
    })
  })

  describe('Mock Contact Display', () => {
    it('displays mock agent contact details', () => {
      mockStoreState.selectedId = 'mock-agent-1'
      
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      // Check for agent display name (alias) in heading
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('翻译助手')
      expect(screen.getByText('广东 深圳')).toBeInTheDocument()
    })

    it('displays mock solid contact details', () => {
      mockStoreState.selectedId = 'mock-solid-1'
      
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      // Check for contact name in heading
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Alice')
      expect(screen.getByText('北京 海淀')).toBeInTheDocument()
    })

    it('displays mock wechat contact details', () => {
      mockStoreState.selectedId = 'mock-wechat-1'
      
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      // Check for contact name in heading
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('老王')
      expect(screen.getByText('上海 黄浦')).toBeInTheDocument()
      expect(screen.getByText('@wechat')).toBeInTheDocument()
    })
  })

  describe('Action Buttons', () => {
    beforeEach(() => {
      mockStoreState.selectedId = 'mock-solid-1'
    })

    it('renders chat, voice, and video buttons', () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('聊天')).toBeInTheDocument()
      expect(screen.getByText('语音')).toBeInTheDocument()
      expect(screen.getByText('视频')).toBeInTheDocument()
    })

    it('navigates to chat when clicking chat button', () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      fireEvent.click(screen.getByText('聊天'))
      
      expect(mockChatStore.selectChat).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith({ 
        to: '/$microAppId', 
        params: { microAppId: 'chat' } 
      })
    })
  })

  describe('Contact Information', () => {
    beforeEach(() => {
      mockStoreState.selectedId = 'mock-solid-1'
    })

    it('displays alias/remark section', () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('备注名')).toBeInTheDocument()
    })

    it('displays tags section', () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('标签')).toBeInTheDocument()
    })

    it('displays public relationship switch', () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('公开关系')).toBeInTheDocument()
    })
  })

  describe('Agent Specific Config', () => {
    beforeEach(() => {
      mockStoreState.selectedId = 'mock-agent-1'
    })

    it('displays system prompt for agents', () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('系统提示词')).toBeInTheDocument()
      expect(screen.getByText(/翻译专家/)).toBeInTheDocument()
    })

    it('displays model selectors for agents', () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('聊天模型')).toBeInTheDocument()
      expect(screen.getByText('语音模型')).toBeInTheDocument()
      expect(screen.getByText('视频模型')).toBeInTheDocument()
    })

    it('displays tools section for agents', () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('插件工具')).toBeInTheDocument()
    })
  })

  describe('Human Contact Info', () => {
    beforeEach(() => {
      mockStoreState.selectedId = 'mock-solid-1'
    })

    it('displays phone and email for human contacts', () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('电话')).toBeInTheDocument()
      expect(screen.getByText('邮箱')).toBeInTheDocument()
    })

    it('displays inbox for solid contacts', () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('Inbox')).toBeInTheDocument()
    })
  })

  describe('Dialogs', () => {
    beforeEach(() => {
      mockStoreState.selectedId = 'mock-solid-1'
    })

    it('opens alias edit dialog when clicking alias row', async () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      fireEvent.click(screen.getByText('备注名'))
      
      await waitFor(() => {
        expect(screen.getByText('修改备注名')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('输入备注名...')).toBeInTheDocument()
      })
    })

    it('opens tags management dialog when clicking tags row', async () => {
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      fireEvent.click(screen.getByText('标签'))
      
      await waitFor(() => {
        expect(screen.getByText('管理标签')).toBeInTheDocument()
      })
    })
  })

  describe('Source Information', () => {
    it('displays source type badge', () => {
      mockStoreState.selectedId = 'mock-solid-1'
      
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('来源')).toBeInTheDocument()
      expect(screen.getByText('solid')).toBeInTheDocument()
    })

    it('shows correct source description for agent', () => {
      mockStoreState.selectedId = 'mock-agent-1'
      
      render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
      
      expect(screen.getByText('本地创建')).toBeInTheDocument()
    })
  })

  // Note: The old "Create Contact View" tests have been removed because the component
  // now uses a Dialog-based flow (createDialogOpen + createType) instead of viewMode='create'.
  // TODO: Add tests for the new CreateAgent and AddFriend dialogs when needed.
})
