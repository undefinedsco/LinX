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

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useRouterState: (input: { select: (state: { location: { pathname: string } }) => string }) =>
      useRouterStateMock(input),
  }
})

vi.mock('./controller', () => ({
  useLoginController: () => controllerMock,
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
  })

  it('hides the login modal on the auth callback route', () => {
    useRouterStateMock.mockImplementation(({ select }) =>
      select({ location: { pathname: '/auth/callback' } }),
    )

    const { container } = render(<LoginOverlay />)
    expect(container.innerHTML).toBe('')
  })
})
