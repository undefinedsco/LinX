import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useRouterStateMock = vi.fn()
const controllerMock = {
  view: 'default' as const,
  state: 'idle' as const,
  error: null,
  storedAccount: null,
  providers: [],
  localLoginStatus: {
    active: false,
    message: null,
  },
  storageConflict: null,
  localOnboarding: null,
  continueStoredAccount: vi.fn(),
  continueLocalLogin: vi.fn(),
  backFromLocal: vi.fn(),
  switchAccount: vi.fn(),
  connect: vi.fn(),
  addProvider: vi.fn(),
  clearError: vi.fn(),
  dismissStorageConflict: vi.fn(),
  openCurrentSpacePodSetup: vi.fn(),
}
const useLoginControllerMock = vi.fn(() => controllerMock)

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useRouterState: (input: { select: (state: { location: { pathname: string } }) => string }) =>
      useRouterStateMock(input),
  }
})

vi.mock('./controller', () => ({
  useLoginController: () => useLoginControllerMock(),
}))

vi.mock('./LoginModal', () => ({
  LoginModal: () => <div>login modal</div>,
}))

import { LoginOverlay } from './LoginOverlay'

describe('LoginOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRouterStateMock.mockImplementation(({ select }) =>
      select({ location: { pathname: '/chat' } }),
    )
  })

  it('renders the login modal on regular routes', () => {
    render(<LoginOverlay />)
    expect(screen.getByText('login modal')).toBeTruthy()
    expect(useLoginControllerMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the login controller mounted on the auth callback route without rendering the modal', () => {
    useRouterStateMock.mockImplementation(({ select }) =>
      select({ location: { pathname: '/auth/callback' } }),
    )

    const { container } = render(<LoginOverlay />)
    expect(container.innerHTML).toBe('')
    expect(useLoginControllerMock).toHaveBeenCalledTimes(1)
  })

  it('does not mount the login controller on test routes', () => {
    useRouterStateMock.mockImplementation(({ select }) =>
      select({ location: { pathname: '/test/inrupt-simple' } }),
    )

    const { container } = render(<LoginOverlay />)
    expect(container.innerHTML).toBe('')
    expect(useLoginControllerMock).not.toHaveBeenCalled()
  })
})
