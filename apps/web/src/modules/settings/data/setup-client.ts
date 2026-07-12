import type { ServiceStatus, ServiceSetupConfigResponse } from '../domain/service-model'
import type { SetupConfigResponse, SetupPayload } from '../domain/setup-model'

export function isServiceSetupMode(): boolean {
  return typeof window !== 'undefined'
    && Boolean((window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__)
}

export function desktopXpodBridge() {
  return typeof window !== 'undefined' ? window.xpodDesktop?.xpod : undefined
}

export async function parseSetupResponseError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null)
  if (typeof data?.error === 'string' && data.error.trim()) return data.error
  if (response.status >= 500) return '服务暂时没有响应。请稍后重试。'
  return '请求没有完成。请稍后重试。'
}

export async function loadSetupConfig(signal?: AbortSignal): Promise<SetupConfigResponse> {
  const response = await fetch('/api/setup/config', { signal })
  if (!response.ok) throw new Error(await parseSetupResponseError(response))
  return response.json()
}

export async function saveSetupConfig(payload: SetupPayload): Promise<void> {
  const response = await fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await parseSetupResponseError(response))
}

export async function loadServiceSetup(signal?: AbortSignal): Promise<{
  status: ServiceStatus | null
  config: ServiceSetupConfigResponse | null
}> {
  const [statusResponse, configResponse] = await Promise.all([
    fetch('/api/service/status', { signal }),
    fetch('/api/setup/config', { signal }),
  ])
  if (!statusResponse.ok) throw new Error(await parseSetupResponseError(statusResponse))
  if (!configResponse.ok) throw new Error(await parseSetupResponseError(configResponse))
  return {
    status: await statusResponse.json(),
    config: await configResponse.json(),
  }
}

export async function loadServiceStatus(): Promise<ServiceStatus> {
  const bridge = desktopXpodBridge()
  if (bridge) {
    const status = await bridge.status()
    return { pod: { ...status, publicUrl: status.provisioning?.publicUrl } }
  }
  const response = await fetch('/api/service/status')
  if (!response.ok) throw new Error(await parseSetupResponseError(response))
  return response.json()
}

export async function runServiceAction(action: 'start' | 'stop' | 'restart'): Promise<void> {
  const bridge = desktopXpodBridge()
  if (bridge && action !== 'start') {
    await bridge[action]()
    return
  }
  const response = await fetch(`/api/service/${action}`, { method: 'POST' })
  if (!response.ok) throw new Error(await parseSetupResponseError(response))
}

export async function upgradeDesktopRuntime(): Promise<void> {
  const bridge = desktopXpodBridge()
  if (!bridge?.upgrade) throw new Error('当前入口不支持直接升级 xpod。')
  await bridge.upgrade()
}

export async function detectPublicIpReachability(): Promise<boolean> {
  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return false
    const data = await response.json()
    if (typeof data?.ip !== 'string') return false
    return !/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(data.ip)
  } catch {
    return false
  }
}
