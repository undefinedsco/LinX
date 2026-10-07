export interface NetworkSnapshotProjectionInput {
  state: string
  publicUrl: string | null
  localUrl: string | null
  baseUrl: string | null
}

export function networkStatusLabel(state: string, loading: boolean): string {
  if (loading) return '读取中'
  if (state === 'ready') return '可用'
  if (state === 'starting' || state === 'checking') return '启动中'
  if (state === 'error' || state === 'repair_required') return '需要处理'
  return '未启动'
}

export function hostFromUrl(value: string): string {
  try {
    return new URL(value).host
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  }
}

export function customDomainInput(publicUrl: string | null): string {
  if (!publicUrl) return ''
  const host = hostFromUrl(publicUrl)
  return host && !isManagedCloudDomain(host) ? host : ''
}

export function cloudflareServiceUrl(snapshot: NetworkSnapshotProjectionInput): string | null {
  const localUrl = snapshot.localUrl ?? snapshot.baseUrl
  if (!localUrl) return null
  try {
    const url = new URL(localUrl)
    return `http://localhost:${url.port || '5737'}`
  } catch {
    return 'http://localhost:5737'
  }
}

function isManagedCloudDomain(hostname: string): boolean {
  return /^node-[a-z0-9-]+\.undefineds\.co$/i.test(hostname)
    || /^[a-z0-9-]+\.nodes\.undefineds\.co$/i.test(hostname)
}
