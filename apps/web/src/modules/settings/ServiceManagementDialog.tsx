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

const LOCAL_DOMAIN_HELP_PATH = '/docs/local-sp-domain-and-tunnel.md'

type DeploymentMode = 'local' | 'standalone'
type DomainSource = 'manual'

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
  autoStart?: boolean
  deploymentMode?: DeploymentMode
  domainSource?: DomainSource
  publicDomain?: string
  autoDetectPublicIp?: boolean
  httpsCertPath?: string
  tunnelProvider?: 'cloudflare' | 'sakura' | ''
  hasTunnelToken?: boolean
}

function ensureLocalDomainSource(): DomainSource {
  return 'manual'
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
  const [autoStart, setAutoStart] = useState(true)
  const [domainSource, setDomainSource] = useState<DomainSource>('manual')
  const [publicDomain, setPublicDomain] = useState('')
  const [autoDetectPublicIp, setAutoDetectPublicIp] = useState(true)
  const [hasPublicIp, setHasPublicIp] = useState<boolean | null>(null)
  const [tunnelProvider, setTunnelProvider] = useState<'cloudflare' | 'sakura' | ''>('')
  const [tunnelToken, setTunnelToken] = useState('')
  const [initialTunnelProvider, setInitialTunnelProvider] = useState<'cloudflare' | 'sakura' | ''>('')
  const [initialHasTunnelToken, setInitialHasTunnelToken] = useState(false)
  const [httpsCertPath, setHttpsCertPath] = useState('')

  const isServiceMode = typeof window !== 'undefined' && !!(window as any).__LINX_SERVICE__

  const running = !!status?.pod?.running
  const podBaseUrl = useMemo(() => trimSlash(status?.pod?.publicUrl || status?.pod?.baseUrl || ''), [status])
  const tunnelSuggested = deploymentMode === 'local' && (!autoDetectPublicIp || hasPublicIp === false)
  const useTunnel = deploymentMode === 'local' && !!tunnelProvider

  const effectivePublicDomain = useMemo(() => {
    return publicDomain.trim()
  }, [publicDomain])

  useEffect(() => {
    const nextSource = ensureLocalDomainSource()
    if (nextSource !== domainSource) {
      setDomainSource(nextSource)
    }
  }, [deploymentMode, domainSource, tunnelSuggested])

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
          if (typeof cfg.autoStart === 'boolean') setAutoStart(cfg.autoStart)
          if (cfg.deploymentMode) setDeploymentMode(cfg.deploymentMode)
          setDomainSource(ensureLocalDomainSource())
          if (cfg.publicDomain) setPublicDomain(cfg.publicDomain)
          if (typeof cfg.autoDetectPublicIp === 'boolean') setAutoDetectPublicIp(cfg.autoDetectPublicIp)
          if (cfg.httpsCertPath) setHttpsCertPath(cfg.httpsCertPath)
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
    if (!open || deploymentMode !== 'local' || !autoDetectPublicIp || running) {
      if (deploymentMode !== 'local') setHasPublicIp(null)
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
  }, [open, deploymentMode, autoDetectPublicIp, running])

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
    if (useTunnel && !effectivePublicDomain) {
      setError('使用隧道时请填写公网域名或隧道域名')
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
        domainSource: 'manual',
        publicDomain: deploymentMode === 'local' && effectivePublicDomain ? effectivePublicDomain || undefined : undefined,
        autoDetectPublicIp,
        httpsCertPath: deploymentMode === 'standalone' ? (httpsCertPath || undefined) : undefined,
        network: {
          accessMode: useTunnel ? 'tunnel' : 'auto',
          tunnelProvider: useTunnel ? tunnelProvider : undefined,
          tunnelToken: useTunnel ? (tunnelToken || undefined) : undefined,
        },
        local: {
          nodeId: undefined,
          deviceId: undefined,
        },
        standalone: {
          customDomain: deploymentMode === 'standalone' ? effectivePublicDomain : undefined,
        },
        autoStart,
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
              <div className="text-xs text-muted-foreground">未启动时配置 6 项参数；启动后查看状态并进入 xpod 原生界面</div>
              <div className="text-xs text-muted-foreground">域名与隧道说明：{LOCAL_DOMAIN_HELP_PATH}</div>
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="service-auto-start">2) 开机自动启动</Label>
                  <Switch id="service-auto-start" checked={autoStart} onCheckedChange={setAutoStart} />
                </div>
              </div>

              {deploymentMode === 'local' ? (
                <>
                  <div className="space-y-2">
                    <Label>3) 公网域名（可选）</Label>
                    <Input value={publicDomain} onChange={(e) => setPublicDomain(e.target.value)} placeholder="pod.example.com" />
                    <div className="text-xs text-muted-foreground">不填写时先保证本机/局域网可用；需要 Cloud 或外网访问本地 SP 时，再填你自己的公网域名或隧道域名。</div>
                    <div className="text-xs text-muted-foreground">配置说明：{LOCAL_DOMAIN_HELP_PATH}</div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label>3) 公网域名（standalone，可选）</Label>
                  <Input value={publicDomain} onChange={(e) => setPublicDomain(e.target.value)} placeholder="pod.example.com" />
                  <div className="text-xs text-muted-foreground">留空时只在本机或局域网使用；需要公网访问时再填你自己的域名。</div>
                </div>
              )}

              {deploymentMode === 'local' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-check">4) 自动检查公网 IP</Label>
                  <Switch id="auto-check" checked={autoDetectPublicIp} onCheckedChange={setAutoDetectPublicIp} />
                </div>
                {autoDetectPublicIp ? (
                  <div className="text-xs text-muted-foreground">
                    检测结果：{hasPublicIp === null ? '检测中...' : hasPublicIp ? '有公网 IP（可直接配置公网入口）' : '无公网 IP（仍可本机/局域网使用，外网访问再配隧道）'}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">已关闭自动检测，将强制使用隧道供应商。</div>
                )}
              </div>
              ) : null}

              {deploymentMode === 'local' ? (
              <div className="space-y-2">
                  <Label>5) 隧道供应商{tunnelSuggested ? '（建议，外网访问时需要）' : '（可选）'}</Label>
                <Select
                  value={tunnelProvider || 'none'}
                  onValueChange={(v) => setTunnelProvider(v === 'none' ? '' : (v as 'cloudflare' | 'sakura'))}
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
              ) : null}

              <div className="space-y-2">
                <Label>{deploymentMode === 'local' ? '6) HTTPS 证书' : '4) HTTPS 证书（可选）'}</Label>
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
