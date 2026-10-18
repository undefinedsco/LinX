import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  aiConnected: true as boolean | null,
  shellId: 'web' as 'web' | 'desktop',
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@/lib/runtime-shell', () => ({ getRuntimeShellInfo: () => ({ id: mocks.shellId, label: '', authLabel: '', description: '' }) }))
vi.mock('@/modules/chat/collections', () => ({ useLinxDefaultSecretaryBootstrapSettling: () => false }))
vi.mock('@/modules/login/hooks/use-local-onboarding', () => ({
  useLocalOnboarding: () => ({ snapshot: { state: 'ready', publicUrl: null }, loading: false }),
}))
vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({ session: { info: { webId: 'https://pod.example/linzhou/profile/card#me', isLoggedIn: true } } }),
}))
vi.mock('@/modules/profile/useSpaceStatus', () => ({
  useSpaceStatus: () => ({
    spaceKind: 'local',
    spaceLabel: '本机',
    providerHost: null,
    issuerLabel: 'undefineds 账号',
    databaseStatus: 'ready',
    online: true,
    aiConnected: mocks.aiConnected,
    aiStatus: mocks.aiConnected === true ? 'connected' : mocks.aiConnected === false ? 'not-connected' : 'checking',
    connectedProviderCount: 2,
    attention: null,
  }),
}))

import { SpaceServicesSection } from './SpaceServicesSection'

describe('Settings › 空间与服务', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.aiConnected = true
    mocks.shellId = 'web'
  })

  it('lays out account, space and AI status in one place', () => {
    render(<SpaceServicesSection />)

    expect(within(screen.getByRole('region', { name: '账号' })).getByText('linzhou')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: '空间' })).getByText('本机')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: '空间' })).getByText('是')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'AI' })).getByText('已连接 2 个')).toBeTruthy()
    // Local service rows only exist in the desktop app.
    expect(screen.queryByRole('region', { name: '本机服务' })).toBeNull()
  })

  it('sends model connection to the model services page', () => {
    mocks.aiConnected = false
    render(<SpaceServicesSection />)

    fireEvent.click(screen.getByRole('button', { name: /模型连接/ }))
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/$microAppId', params: { microAppId: 'model-services' } })
  })

  it('shows local service state in the desktop app', () => {
    mocks.shellId = 'desktop'
    render(<SpaceServicesSection />)

    expect(within(screen.getByRole('region', { name: '本机服务' })).getByText('运行中')).toBeTruthy()
  })
})
