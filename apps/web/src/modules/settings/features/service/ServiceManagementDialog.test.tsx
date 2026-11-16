import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ServiceManagementDialog } from './ServiceManagementDialog'

const fetchMock = vi.fn()

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response
}

describe('ServiceManagementDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true
    delete window.xpodDesktop
  })

  it('opens configuration without starting xpod and keeps advanced values hidden', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ pod: { running: false, status: 'stopped' } }))
    fetchMock.mockResolvedValueOnce(jsonResponse({
      dataDir: '/tmp/linx-pod',
      spaceKind: 'local',
      publicDomain: 'pod.example.com',
      autoDetectPublicIp: false,
      tunnelProvider: 'cloudflare',
      hasTunnelToken: true,
    }))

    render(<ServiceManagementDialog open onOpenChange={vi.fn()} />)

    expect(await screen.findByDisplayValue('/tmp/linx-pod')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('pod.example.com')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('自动检查公网 IP')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/service/start', expect.anything())

    const disclosure = screen.getByRole('button', { name: '高级网络设置' })
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(disclosure)

    expect(screen.getByDisplayValue('pod.example.com')).toBeInTheDocument()
    expect(screen.getByLabelText('自动检查公网 IP')).toBeInTheDocument()
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows a load error without exposing a blank configuration form', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: '读取服务状态失败。' }, 503))
    fetchMock.mockResolvedValueOnce(jsonResponse({ dataDir: '/tmp/linx-pod' }))

    render(<ServiceManagementDialog open onOpenChange={vi.fn()} />)

    expect(await screen.findByText('读取服务状态失败。')).toBeInTheDocument()
    expect(screen.queryByLabelText('数据地址')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存并启动服务' })).not.toBeInTheDocument()
  })

  it('asks before stopping the service and only stops after confirming', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ pod: { running: true, status: 'running', baseUrl: 'http://localhost:5739/' } }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ dataDir: '/tmp/linx-pod' }))
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    fetchMock.mockResolvedValueOnce(jsonResponse({ pod: { running: false, status: 'stopped' } }))

    render(<ServiceManagementDialog open onOpenChange={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: '停止' }))

    const confirm = await screen.findByRole('dialog', { name: '停止本机服务？' })
    expect(within(confirm).getByText('停止后，LinX 将无法读写这个本机空间，直到你重新启动服务。')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/service/stop', expect.anything())

    fireEvent.click(within(confirm).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '停止本机服务？' })).not.toBeInTheDocument())
    expect(fetchMock).not.toHaveBeenCalledWith('/api/service/stop', expect.anything())

    fireEvent.click(screen.getByRole('button', { name: '停止' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: '停止本机服务？' })).getByRole('button', { name: '停止' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/service/stop', { method: 'POST' }))
  })
})
