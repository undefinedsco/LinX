import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const saveNetworkConfig = vi.fn()
const onboardingState = {
  snapshot: {
    state: 'ready' as const,
    spaceKind: 'local' as const,
    localUrl: 'http://localhost:5737/',
    baseUrl: 'https://node-0000.undefineds.co/',
    publicUrl: 'https://node-0000.undefineds.co/',
    tunnel: { provider: 'cloudflare' as const, hasToken: false, endpoint: null },
    connectivity: null,
    capabilities: null,
    cloudIdentityUrl: 'https://id.undefineds.co',
    provisionCode: null,
    provisionUrl: null,
    nodeId: 'node-123',
    message: null,
    errorCode: null,
    canRetry: true,
    canOpenSettings: true,
  },
  isDesktop: true,
  loading: false,
  acting: false,
  refresh: vi.fn().mockResolvedValue(undefined),
  saveNetworkConfig,
  testConnectivity: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../../data/use-local-onboarding', () => ({
  useLocalOnboarding: () => onboardingState,
}))

import { LocalNetworkSettingsCard } from './LocalNetworkSettingsCard'

describe('LocalNetworkSettingsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps a tunnel token after a resolved save error and clears it after retry success', async () => {
    saveNetworkConfig
      .mockResolvedValueOnce({ errorCode: 'INVALID_TUNNEL_TOKEN', message: '隧道密钥无效。' })
      .mockResolvedValueOnce({ errorCode: null })

    render(<LocalNetworkSettingsCard />)
    fireEvent.click(screen.getByRole('button', { name: '高级网络设置' }))

    const tokenInput = screen.getByLabelText('Cloudflare Tunnel token（可选）')
    fireEvent.change(tokenInput, { target: { value: 'retry-token' } })
    fireEvent.click(screen.getByRole('button', { name: '保存网络设置' }))

    expect(await screen.findByText('隧道密钥无效。')).toBeInTheDocument()
    expect(tokenInput).toHaveValue('retry-token')

    fireEvent.click(screen.getByRole('button', { name: '保存网络设置' }))

    expect(await screen.findByText('网络配置已保存。')).toBeInTheDocument()
    expect(tokenInput).toHaveValue('')
  })
})
