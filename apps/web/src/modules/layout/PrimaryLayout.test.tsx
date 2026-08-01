import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockNavigate = vi.fn()
const mockSessionState = vi.hoisted(() => ({
  isLoggedIn: true,
  sessionRequestInProgress: false,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/providers/solid-session-provider', () => ({
  useSession: () => ({
    session: {
      info: {
        isLoggedIn: mockSessionState.isLoggedIn,
      },
    },
    sessionRequestInProgress: mockSessionState.sessionRequestInProgress,
  }),
}))

vi.mock('@/modules/profile/SelfProfileCard', () => ({
  SelfProfileCard: () => <div>SelfProfileCard</div>,
}))

vi.mock('@/modules/settings/features/service/ServiceManagementDialog', () => ({
  ServiceManagementDialog: () => null,
}))

vi.mock('@/components/ShellStatusBadge', () => ({
  ShellStatusBadge: () => <div>ShellStatusBadge</div>,
}))

vi.mock('@/modules/inbox/components/InboxBellButton', () => ({
  InboxBellButton: () => <button aria-label="收件箱通知" type="button" />,
}))

import { getMainPanelDefaultSize, PrimaryLayout } from './PrimaryLayout'

describe('PrimaryLayout', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    class ResizeObserverMock {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSessionState.isLoggedIn = true
    mockSessionState.sessionRequestInProgress = false
  })

  it('shows only stable first-slice modules in primary navigation', () => {
    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.getByLabelText('聊天')).toBeTruthy()
    expect(screen.getByLabelText('联系人')).toBeTruthy()
    expect(screen.getByLabelText('文件')).toBeTruthy()
    expect(screen.getByLabelText('收藏')).toBeTruthy()
  })

  it('does not duplicate Files with a second chat-files shortcut in the global rail', () => {
    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.queryByRole('button', { name: '聊天文件' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '文件' })).toHaveLength(1)
  })

  it('opens the primary Files navigation in the full files scope', () => {
    const onNavigate = vi.fn()
    render(<PrimaryLayout microAppId="chat" onNavigate={onNavigate} />)

    screen.getByRole('button', { name: '文件' }).click()

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/$microAppId', params: { microAppId: 'files' } })
    expect(onNavigate).toHaveBeenCalledWith('files', 'default')
  })

  it('marks the active micro app on the layout root for route smoke tests', () => {
    const { container } = render(<PrimaryLayout microAppId="files" />)

    expect(container.querySelector('[data-micro-app-id="files"]')).not.toBeNull()
  })

  it('hides unfinished modules from the primary navigation', () => {
    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.queryByLabelText('收件箱')).toBeNull()
  })

  it('does not expose the unfinished import utility', () => {
    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.queryByLabelText('导入')).toBeNull()
    expect(screen.getByLabelText('设置')).toBeTruthy()
  })

  it('exposes the self profile trigger as an accessible button', () => {
    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.getByRole('button', { name: '个人资料' })).toBeTruthy()
  })

  it('keeps the module list pane at a usable desktop width', () => {
    render(<PrimaryLayout microAppId="chat" />)

    const listPanel = screen.getByTestId('micro-app-list-panel')
    expect(listPanel.style.minWidth).toBe('180px')
    expect(listPanel.style.width).toBe('100%')
    expect(listPanel.style.maxWidth).toBe('400px')
    expect(listPanel.className).toContain('overflow-hidden')
  })

  it('applies the Files module list panel width contract from layout config', async () => {
    render(<PrimaryLayout microAppId="files" />)

    const listPanel = await screen.findByTestId('micro-app-list-panel')
    await waitFor(() => {
      expect(listPanel.style.minWidth).toBe('232px')
    })
    expect(listPanel.style.width).toBe('100%')
    expect(listPanel.style.maxWidth).toBe('360px')
    expect(listPanel.parentElement?.style.minWidth).toBe('232px')
    expect(listPanel.parentElement?.style.width).toBe('240px')
    expect(listPanel.parentElement?.style.maxWidth).toBe('360px')
  })

  it('toggles the list panel when clicking the active rail icon', async () => {
    const onNavigate = vi.fn()
    render(<PrimaryLayout microAppId="files" onNavigate={onNavigate} />)

    const filesButton = screen.getByRole('button', { name: '文件' })
    expect(screen.getByTestId('micro-app-list-panel')).toBeTruthy()

    filesButton.click()
    await waitFor(() => {
      expect(screen.queryByTestId('micro-app-list-panel')).toBeNull()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(onNavigate).not.toHaveBeenCalled()

    filesButton.click()
    await waitFor(() => {
      expect(screen.getByTestId('micro-app-list-panel')).toBeTruthy()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('keeps normal navigation for non-active rail icons', () => {
    const onNavigate = vi.fn()
    render(<PrimaryLayout microAppId="files" onNavigate={onNavigate} />)

    screen.getByRole('button', { name: '聊天' }).click()

    expect(screen.getByTestId('micro-app-list-panel')).toBeTruthy()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/$microAppId', params: { microAppId: 'chat' } })
    expect(onNavigate).toHaveBeenCalledWith('chat', 'default')
  })

  it('allocates the main workspace as a percentage instead of an 80px panel', () => {
    expect(getMainPanelDefaultSize(false)).toBe('80%')
    expect(getMainPanelDefaultSize(true)).toBe('100%')
  })

  it('removes the module list pane from compact layout so app content remains reachable', () => {
    const previousMatchMedia = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 559px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    try {
      render(<PrimaryLayout microAppId="files" />)
      expect(screen.queryByTestId('micro-app-list-panel')).toBeNull()
      expect(screen.queryByRole('button', { name: '文件' })).toBeNull()
      expect(screen.queryByTestId('micro-app-content-head')).toBeNull()
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: previousMatchMedia,
      })
    }
  })

  it('keeps the main content head at the compact Files design height', () => {
    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.getByTestId('micro-app-content-head').className).toContain('h-12')
    expect(screen.getByTestId('micro-app-content-head').className).not.toContain('h-16')
  })

  it('offers a collapsed-by-default right sidebar toggle wired to the module state', async () => {
    const { useFilesStore } = await import('@/modules/files/app/store')
    useFilesStore.setState({ metaSidebarOpen: false })

    render(<PrimaryLayout microAppId="files" />)

    const toggle = await screen.findByRole('button', { name: '展开右侧面板' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    toggle.click()

    await waitFor(() => {
      expect(useFilesStore.getState().metaSidebarOpen).toBe(true)
    })
    expect(await screen.findByRole('button', { name: '收起右侧面板' })).toHaveAttribute('aria-expanded', 'true')

    useFilesStore.setState({ metaSidebarOpen: false })
  })

  it('aligns the profile avatar top with the compact head/body boundary', () => {
    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.getByTestId('primary-profile-avatar-slot').className).toContain('pt-[48px]')
  })

  it('hides the application shell after sign out', () => {
    mockSessionState.isLoggedIn = false

    render(<PrimaryLayout microAppId="chat" />)

    expect(screen.queryByLabelText('聊天')).toBeNull()
    expect(screen.queryByLabelText('个人资料')).toBeNull()
    expect(screen.queryByText('打开 聊天')).toBeNull()
  })
})
