import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockNavigate = vi.fn()
const fetchMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

import { SetupView } from './SetupView'

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response
}

describe('SetupView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true
  })

  it('loads existing service setup config', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dataDir: '/tmp/linx-pod',
      port: 5737,
      spaceKind: 'local',
      domainSource: 'manual',
      autoDetectPublicIp: true,
      tunnelProvider: '',
      hasTunnelToken: false,
    }))

    render(<SetupView />)

    expect(await screen.findByDisplayValue('/tmp/linx-pod')).toBeInTheDocument()
    expect(screen.getByText(/Cloud provisioning 分配 Cloud-managed canonical URL/)).toBeInTheDocument()
  })

  it('saves a local setup payload without a generated public domain', async () => {
    const onComplete = vi.fn()

    fetchMock.mockResolvedValueOnce(jsonResponse({
      dataDir: '/tmp/linx-pod',
      port: 5737,
      spaceKind: 'local',
      domainSource: 'manual',
      autoDetectPublicIp: true,
      tunnelProvider: '',
      hasTunnelToken: false,
    }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }))

    render(<SetupView onComplete={onComplete} />)

    expect(await screen.findByDisplayValue('/tmp/linx-pod')).toBeInTheDocument()

    fireEvent.click(screen.getByText('保存配置'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const [, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(String(requestInit.body))

    expect(fetchMock.mock.calls[1][0]).toBe('/api/setup')
    expect(body).toMatchObject({
      dataDir: '/tmp/linx-pod',
      port: 5737,
      autoStart: true,
      spaceKind: 'local',
      domainSource: 'manual',
      autoDetectPublicIp: true,
      network: {
        accessMode: 'auto',
      },
      local: {},
    })
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      spaceKind: 'local',
      pod: expect.objectContaining({ dataDir: '/tmp/linx-pod' }),
    }))
    expect(await screen.findByText('配置已保存，服务正在继续启动。')).toBeInTheDocument()
  })

  it('does not include a manual public domain for direct-access local setup', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dataDir: '/tmp/linx-pod',
      port: 5737,
      spaceKind: 'local',
      domainSource: 'manual',
      autoDetectPublicIp: true,
      tunnelProvider: '',
      hasTunnelToken: false,
    }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }))

    render(<SetupView />)

    expect(await screen.findByDisplayValue('/tmp/linx-pod')).toBeInTheDocument()
    fireEvent.click(screen.getByText('保存配置'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const [, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(String(requestInit.body))

    expect(body.publicDomain).toBeUndefined()
    expect(body.httpsCertPath).toBeUndefined()
    expect(body.domainSource).toBe('manual')
  })

  it('uses a manual public domain as Local user-managed canonical domain when provided with tunnel access', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dataDir: '/tmp/linx-pod',
      port: 5737,
      spaceKind: 'local',
      domainSource: 'manual',
      publicDomain: 'pod.example.com',
      autoDetectPublicIp: false,
      tunnelProvider: 'cloudflare',
      hasTunnelToken: true,
    }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }))

    render(<SetupView />)

    expect(await screen.findByDisplayValue('/tmp/linx-pod')).toBeInTheDocument()
    fireEvent.click(screen.getByText('保存配置'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const [, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(String(requestInit.body))

    expect(body.domainSource).toBe('manual')
    expect(body.publicDomain).toBe('pod.example.com')
  })

  it('allows Local Cloud-managed canonical domain tunnel setup without a manual public domain', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dataDir: '/tmp/linx-pod',
      port: 5737,
      spaceKind: 'local',
      domainSource: 'manual',
      publicDomain: '',
      autoDetectPublicIp: false,
      tunnelProvider: 'cloudflare',
      hasTunnelToken: true,
    }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }))

    render(<SetupView />)

    expect(await screen.findByDisplayValue('/tmp/linx-pod')).toBeInTheDocument()
    fireEvent.click(screen.getByText('保存配置'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const [, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(String(requestInit.body))

    expect(body.spaceKind).toBe('local')
    expect(body.publicDomain).toBeUndefined()
    expect(body.network.accessMode).toBe('tunnel')
    expect(body.network.tunnelProvider).toBe('cloudflare')
  })

  it('saves a standalone setup without a public domain', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dataDir: '/tmp/linx-pod',
      port: 5737,
      spaceKind: 'standalone',
      domainSource: 'manual',
      autoDetectPublicIp: true,
      tunnelProvider: '',
      hasTunnelToken: false,
    }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }))

    render(<SetupView />)

    expect(await screen.findByDisplayValue('/tmp/linx-pod')).toBeInTheDocument()
    fireEvent.click(screen.getByText('保存配置'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const [, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(String(requestInit.body))

    expect(body.spaceKind).toBe('standalone')
    expect(body.publicDomain).toBeUndefined()
    expect(body.standalone.customDomain).toBeUndefined()
    expect(body.network.accessMode).toBe('auto')
  })

  it('allows local setup without tunnel provider when public reachability is unavailable', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dataDir: '/tmp/linx-pod',
      port: 5737,
      spaceKind: 'local',
      domainSource: 'manual',
      publicDomain: 'pod.example.com',
      autoDetectPublicIp: false,
      tunnelProvider: '',
      hasTunnelToken: false,
    }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }))

    render(<SetupView />)

    expect(await screen.findByDisplayValue('/tmp/linx-pod')).toBeInTheDocument()

    fireEvent.click(screen.getByText('保存配置'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const [, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(String(requestInit.body))

    expect(body.network.accessMode).toBe('auto')
    expect(body.network.tunnelProvider).toBeUndefined()
  })

  it('blocks save when Cloudflare tunnel is selected without a token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dataDir: '/tmp/linx-pod',
      port: 5737,
      spaceKind: 'local',
      domainSource: 'manual',
      publicDomain: 'pod.example.com',
      autoDetectPublicIp: false,
      tunnelProvider: 'cloudflare',
      hasTunnelToken: false,
    }))

    render(<SetupView />)

    expect(await screen.findByDisplayValue('/tmp/linx-pod')).toBeInTheDocument()

    fireEvent.click(screen.getByText('保存配置'))

    expect(await screen.findByText('请填写隧道 Token，或沿用已配置 Token')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
