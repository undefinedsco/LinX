import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Loader2, Server, CircleDot, Play, Square, RotateCw } from 'lucide-react'

type DeploymentMode = 'local' | 'standalone'
type DomainSource = 'cloud' | 'manual'

type ServiceStatus = {
  pod?: {
    running?: boolean
    port?: number
    baseUrl?: string
    publicUrl?: string
  }
}

type SetupConfigResponse = {
  dataDir?: string
  deploymentMode?: DeploymentMode
  domainSource?: DomainSource
  publicDomain?: string
  autoDetectPublicIp?: boolean
  httpsCertPath?: string
  subdomain?: string
  deviceId?: string
  tunnelProvider?: 'cloudflare' | 'sakura' | ''
  hasTunnelToken?: boolean
}

interface ServiceManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

async function detectPublicIpReachability(): Promise<boolean> {
  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return false
    const data = await response.json()
    if (!data?.ip || typeof data.ip !== 'string') return false

    const isPrivate = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(data.ip)
    return !isPrivate
  } catch {
    return false
  }
}

export function ServiceManagementDialog({ open, onOpenChange }: ServiceManagementDialogProps) {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<ServiceStatus | null>(null)

  // Parameters
  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode>('local')
  const [dataDir, setDataDir] = useState('')
  const [domainSource, setDomainSource] = useState<DomainSource>('cloud')
  const [publicDomain, setPublicDomain] = useState('')
  const [autoDetectPublicIp, setAutoDetectPublicIp] = useState(true)
  const [hasPublicIp, setHasPublicIp] = useState<boolean | null>(null)
  const [tunnelProvider, setTunnelProvider] = useState<'cloudflare' | 'sakura' | ''>('')
  const [tunnelToken, setTunnelToken] = useState('')
  const [initialTunnelProvider, setInitialTunnelProvider] = useState<'cloudflare' | 'sakura' | ''>('')
  const [initialHasTunnelToken, setInitialHasTunnelToken] = useState(false)
  const [httpsCertPath, setHttpsCertPath] = useState('')

  // local-cloud fields
  const [subdomain, setSubdomain] = useState('')
  const [deviceId, setDeviceId] = useState('')

  const isServiceMode = typeof window !== 'undefined' && !!(window as any).__LINX_SERVICE__

  const running = !!status?.pod?.running
  const podBaseUrl = useMemo(() => trimSlash(status?.pod?.publicUrl || status?.pod?.baseUrl || ''), [status])

  const effectivePublicDomain = useMemo(() => {
    if (deploymentMode === 'local' && domainSource === 'cloud' && subdomain) {
      return `${subdomain}.undefineds.xyz`
    }
    return publicDomain.trim()
  }, [deploymentMode, domainSource, subdomain, publicDomain])

  const tunnelRequired = !autoDetectPublicIp || hasPublicIp === false
  const useTunnel = tunnelRequired && !!tunnelProvider

  useEffect(() => {
    if (deploymentMode === 'standalone' && domainSource !== 'manual') {
      setDomainSource('manual')
    }
  }, [deploymentMode, domainSource])

  const refreshStatus = async () => {
    if (!isServiceMode) return
    const res = await fetch('/api/service/status')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    setStatus(data)
  }

  useEffect(() => {
    if (!open) return

    let cancelled = false
    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)

      if (!isServiceMode) {
        setLoading(false)
        return
      }

      try {
        const [statusRes, configRes] = await Promise.all([
          fetch('/api/service/status', { signal: controller.signal }),
          fetch('/api/setup/config', { signal: controller.signal }),
        ])

        if (statusRes.ok && !cancelled) {
          setStatus(await statusRes.json())
        }

        if (configRes.ok && !cancelled) {
          const cfg = (await configRes.json()) as SetupConfigResponse
          if (cfg.dataDir) setDataDir(cfg.dataDir)
          if (cfg.deploymentMode) setDeploymentMode(cfg.deploymentMode)
          if (cfg.domainSource) setDomainSource(cfg.domainSource)
          if (cfg.publicDomain) setPublicDomain(cfg.publicDomain)
          if (typeof cfg.autoDetectPublicIp === 'boolean') setAutoDetectPublicIp(cfg.autoDetectPublicIp)
          if (cfg.httpsCertPath) setHttpsCertPath(cfg.httpsCertPath)
          if (cfg.subdomain) setSubdomain(cfg.subdomain)
          if (cfg.deviceId) setDeviceId(cfg.deviceId)
          if (typeof cfg.hasTunnelToken === 'boolean') setInitialHasTunnelToken(cfg.hasTunnelToken)
          if (cfg.tunnelProvider) {
            setTunnelProvider(cfg.tunnelProvider)
            setInitialTunnelProvider(cfg.tunnelProvider)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [open, isServiceMode])

  useEffect(() => {
    if (!open || !autoDetectPublicIp || running) {
      if (!autoDetectPublicIp) setHasPublicIp(false)
      return
    }

    let cancelled = false
    const run = async () => {
      const reachable = await detectPublicIpReachability()
      if (!cancelled) setHasPublicIp(reachable)
    }
    void run()

    return () => {
      cancelled = true
    }
  }, [open, autoDetectPublicIp, running])

  const postServiceAction = async (path: '/api/service/start' | '/api/service/stop' | '/api/service/restart') => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(path, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  const saveAndStart = async () => {
    if (!dataDir) {
      setError('请填写数据地址')
      return
    }
    const requiresManualDomain = deploymentMode === 'standalone' || (deploymentMode === 'local' && domainSource === 'manual')
    if (requiresManualDomain && !effectivePublicDomain) {
      setError('请填写公网域名')
      return
    }
    if (tunnelRequired && !useTunnel) {
      setError('公网 IP 不可用时必须选择隧道供应商')
      return
    }

    if (useTunnel) {
      const canReuseToken = initialHasTunnelToken && tunnelProvider === initialTunnelProvider && !tunnelToken
      if (!tunnelToken && !canReuseToken) {
        setError('请选择隧道供应商并填写隧道 Token（或沿用已配置的 Token）')
        return
      }
    }

    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        dataDir,
        port: 5737,
        deploymentMode,
        domainSource,
        publicDomain: effectivePublicDomain || undefined,
        autoDetectPublicIp,
        httpsCertPath,
        network: {
          accessMode: useTunnel ? 'tunnel' : 'auto',
          tunnelProvider: useTunnel ? tunnelProvider : undefined,
          tunnelToken: useTunnel ? (tunnelToken || undefined) : undefined,
        },
        local: {
          subdomain: deploymentMode === 'local' && domainSource === 'cloud' ? subdomain : undefined,
          deviceId: deploymentMode === 'local' && domainSource === 'cloud' ? deviceId : undefined,
        },
        standalone: {
          customDomain: deploymentMode === 'standalone' ? effectivePublicDomain : undefined,
        },
        autoStart: true,
      }

      const setupRes = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!setupRes.ok) throw new Error(`setup: HTTP ${setupRes.status}`)

      const startRes = await fetch('/api/service/start', { method: 'POST' })
      if (!startRes.ok) throw new Error(`start: HTTP ${startRes.status}`)

      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  const openExternal = (url: string) => {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-lg border-border/30 bg-background">
        <div className="p-6 border-b border-border/30 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 rounded-md bg-primary flex items-center justify-center">
              <Server className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">服务管理</div>
              <div className="text-xs text-muted-foreground">未启动时配置 5 项参数；启动后查看状态并进入 xpod 原生界面</div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {!isServiceMode ? <div className="text-sm text-muted-foreground">当前不是 LinX Service 模式。</div> : null}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在读取服务状态...
            </div>
          ) : null}

          {error ? <div className="text-sm text-destructive">操作失败：{error}</div> : null}

          {!running ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>部署模式</Label>
                <Tabs value={deploymentMode} onValueChange={(v) => setDeploymentMode(v as DeploymentMode)}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="local">local</TabsTrigger>
                    <TabsTrigger value="standalone">standalone</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="space-y-2">
                <Label>1) 数据地址</Label>
                <Input value={dataDir} onChange={(e) => setDataDir(e.target.value)} placeholder="~/Library/Application Support/LinX/pod" />
              </div>

              {deploymentMode === 'local' ? (
                <>
                  <div className="space-y-2">
                    <Label>2) 公网域名来源</Label>
                    <Select value={domainSource} onValueChange={(v) => setDomainSource(v as DomainSource)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cloud">cloud 分配</SelectItem>
                        <SelectItem value="manual">手动填写</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {domainSource === 'cloud' ? (
                    <div className="space-y-2">
                      <Label>cloud 子域名（可选，不填则由 cloud 分配）</Label>
                      <Input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="alice" />
                      <Input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="deviceId（可选）" />
                      <div className="text-xs text-muted-foreground">最终域名：{subdomain ? `${subdomain}.undefineds.xyz` : '-'}</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>2) 公网域名（手填）</Label>
                      <Input value={publicDomain} onChange={(e) => setPublicDomain(e.target.value)} placeholder="pod.example.com" />
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <Label>2) 公网域名（standalone）</Label>
                  <Input value={publicDomain} onChange={(e) => setPublicDomain(e.target.value)} placeholder="pod.example.com" />
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-check">3) 自动检查公网 IP</Label>
                  <Switch id="auto-check" checked={autoDetectPublicIp} onCheckedChange={setAutoDetectPublicIp} />
                </div>
                {autoDetectPublicIp ? (
                  <div className="text-xs text-muted-foreground">
                    检测结果：{hasPublicIp === null ? '检测中...' : hasPublicIp ? '有公网 IP（默认不走隧道）' : '无公网 IP（需配置隧道供应商）'}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">已关闭自动检测，将强制使用隧道供应商。</div>
                )}
              </div>

              <div className="space-y-2">
                <Label>4) 隧道供应商{tunnelRequired ? '（必选）' : '（检测到公网 IP，无需配置）'}</Label>
                <Select
                  value={tunnelProvider || 'none'}
                  onValueChange={(v) => setTunnelProvider(v === 'none' ? '' : (v as 'cloudflare' | 'sakura'))}
                  disabled={!tunnelRequired}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不使用隧道</SelectItem>
                    <SelectItem value="cloudflare">cloudflare</SelectItem>
                    <SelectItem value="sakura">sakura frp</SelectItem>
                  </SelectContent>
                </Select>

                {useTunnel ? (
                  <div className="pt-2 space-y-2">
                    <Label>隧道 Token</Label>
                    <Input
                      value={tunnelToken}
                      onChange={(e) => setTunnelToken(e.target.value)}
                      placeholder={initialHasTunnelToken && tunnelProvider === initialTunnelProvider ? '留空则沿用已配置 Token' : '必填'}
                    />
                    {initialHasTunnelToken && tunnelProvider === initialTunnelProvider ? (
                      <div className="text-xs text-muted-foreground">已检测到本机已配置 Token（不会回显明文）。</div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>5) HTTPS 证书</Label>
                <Input value={httpsCertPath} onChange={(e) => setHttpsCertPath(e.target.value)} placeholder="证书路径（例如 /path/to/fullchain.pem）" />
              </div>

              <Button onClick={saveAndStart} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                保存并启动服务
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-border/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CircleDot className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">运行中</span>
                  <Badge variant="secondary" className="ml-auto">
                    {status?.pod?.publicUrl ? '公网地址' : '本地地址'}
                  </Badge>
                </div>
                <div className="text-xs font-mono text-muted-foreground break-all">{podBaseUrl || '未获取到 xpod 地址'}</div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Button className="justify-start" onClick={() => openExternal(`${podBaseUrl}/app/`)} disabled={!podBaseUrl}>
                  <ExternalLink className="h-4 w-4 mr-2" /> 打开 xpod App
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => openExternal(`${podBaseUrl}/dashboard/`)} disabled={!podBaseUrl}>
                  <ExternalLink className="h-4 w-4 mr-2" /> 打开 xpod Dashboard
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => postServiceAction('/api/service/restart')} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCw className="h-4 w-4 mr-2" />}
                  重启
                </Button>
                <Button variant="destructive" onClick={() => postServiceAction('/api/service/stop')} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Square className="h-4 w-4 mr-2" />}
                  停止
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
