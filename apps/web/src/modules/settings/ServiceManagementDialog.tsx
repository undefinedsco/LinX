import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Download, ExternalLink, Loader2, Server, CircleDot, Play, Square, RotateCw } from 'lucide-react'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'

type ServiceSpaceKind = 'local' | 'standalone'
type DomainSource = 'manual'

type ServiceStatus = {
  pod?: {
    running?: boolean
    status?: 'starting' | 'running' | 'stopped' | 'error'
    port?: number
    baseUrl?: string
    publicUrl?: string
    localUrl?: string
    pid?: number
    runtime?: {
      launchKind?: string | null
      currentVersion?: string | null
      targetVersion?: string | null
      upgradeAvailable?: boolean
    }
  }
}

type SetupConfigResponse = {
  dataDir?: string
  autoStart?: boolean
  spaceKind?: ServiceSpaceKind
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

async function parseError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null)
  if (typeof data?.error === 'string' && data.error.trim()) return data.error
  if (response.status >= 500) return '服务暂时没有响应。请稍后重试。'
  return '请求没有完成。请稍后重试。'
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
  const [spaceKind, setSpaceKind] = useState<ServiceSpaceKind>('local')
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
  const desktopXpodApi = typeof window !== 'undefined' ? window.xpodDesktop?.xpod : undefined
  const isDesktopMode = !isServiceMode && Boolean(desktopXpodApi)
  const supportsServiceManagement = isServiceMode || isDesktopMode

  const running = !!status?.pod?.running
  const podBaseUrl = useMemo(() => trimSlash(status?.pod?.publicUrl || status?.pod?.baseUrl || ''), [status])
  const runtime = status?.pod?.runtime
  const canUpgradeXpod = isDesktopMode && Boolean(runtime?.upgradeAvailable)
  const tunnelSuggested = spaceKind === 'local' && (!autoDetectPublicIp || hasPublicIp === false)
  const useTunnel = spaceKind === 'local' && !!tunnelProvider

  const effectivePublicDomain = useMemo(() => {
    return publicDomain.trim()
  }, [publicDomain])

  useEffect(() => {
    const nextSource = ensureLocalDomainSource()
    if (nextSource !== domainSource) {
      setDomainSource(nextSource)
    }
  }, [spaceKind, domainSource, tunnelSuggested])

  const refreshStatus = async () => {
    if (isDesktopMode && desktopXpodApi) {
      const desktopStatus = await desktopXpodApi.status()
      setStatus({
        pod: {
          ...desktopStatus,
          publicUrl: desktopStatus.provisioning?.publicUrl,
        },
      })
      return
    }

    if (!isServiceMode) return
    const res = await fetch('/api/service/status')
    if (!res.ok) throw new Error(await parseError(res))
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

      if (!supportsServiceManagement) {
        setLoading(false)
        return
      }

      try {
        if (isDesktopMode && desktopXpodApi) {
          const desktopStatus = await desktopXpodApi.status()
          if (!cancelled) {
            setStatus({
              pod: {
                ...desktopStatus,
                publicUrl: desktopStatus.provisioning?.publicUrl,
              },
            })
          }
          return
        }

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
          if (cfg.spaceKind) setSpaceKind(cfg.spaceKind)
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
          setError(formatLoginErrorForUser(err, '读取本地空间设置失败。请稍后重试。'))
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
  }, [open, isServiceMode, isDesktopMode, supportsServiceManagement, desktopXpodApi])

  useEffect(() => {
    if (!open || !isServiceMode || spaceKind !== 'local' || !autoDetectPublicIp || running) {
      if (spaceKind !== 'local') setHasPublicIp(null)
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
  }, [open, isServiceMode, spaceKind, autoDetectPublicIp, running])

  const runXpodAction = async (
    action: 'stop' | 'restart',
    servicePath: '/api/service/stop' | '/api/service/restart',
  ) => {
    setSubmitting(true)
    setError(null)
    try {
      if (isDesktopMode && desktopXpodApi) {
        await desktopXpodApi[action]()
      } else {
        const res = await fetch(servicePath, { method: 'POST' })
        if (!res.ok) throw new Error(await parseError(res))
      }
      await refreshStatus()
    } catch (err) {
      setError(formatLoginErrorForUser(err, '本地空间操作失败。请稍后重试。'))
    } finally {
      setSubmitting(false)
    }
  }

  const upgradeXpodRuntime = async () => {
    if (!desktopXpodApi?.upgrade) {
      setError('当前入口不支持直接升级 xpod。')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await desktopXpodApi.upgrade()
      await refreshStatus()
    } catch (err) {
      setError(formatLoginErrorForUser(err, 'xpod 升级失败。请稍后重试。'))
    } finally {
      setSubmitting(false)
    }
  }

  const saveAndStart = async () => {
    if (!dataDir) {
      setError('请填写数据地址')
      return
    }

    if (useTunnel) {
      const canReuseToken = initialHasTunnelToken && tunnelProvider === initialTunnelProvider && !tunnelToken
      if (!tunnelToken && !canReuseToken) {
        setError('请选择外网访问方式并填写隧道密钥（或沿用已保存的密钥）')
        return
      }
    }

    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        dataDir,
        port: 5737,
        spaceKind,
        domainSource: 'manual',
        publicDomain: spaceKind === 'local' && effectivePublicDomain ? effectivePublicDomain || undefined : undefined,
        autoDetectPublicIp,
        httpsCertPath: spaceKind === 'standalone' ? (httpsCertPath || undefined) : undefined,
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
          customDomain: spaceKind === 'standalone' ? effectivePublicDomain : undefined,
        },
        autoStart,
      }

      const setupRes = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!setupRes.ok) throw new Error(await parseError(setupRes))

      const startRes = await fetch('/api/service/start', { method: 'POST' })
      if (!startRes.ok) throw new Error(await parseError(startRes))

      await refreshStatus()
    } catch (err) {
      setError(formatLoginErrorForUser(err, '保存并启动本地空间失败。请检查配置后重试。'))
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
              <div className="text-base font-semibold text-foreground">xpod 状态</div>
              <div className="text-xs text-muted-foreground">查看本地 xpod 状态；检测到新版本时可手动升级。</div>
              <div className="text-xs text-muted-foreground">外网访问可选配置自有域名或隧道。</div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {!supportsServiceManagement ? <div className="text-sm text-muted-foreground">当前入口不支持 xpod 状态管理。</div> : null}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在读取服务状态...
            </div>
          ) : null}

          {error ? (
            <div className="text-sm text-destructive">
              {formatLoginErrorForUser(error, '本地空间暂时无法完成操作。请稍后重试。')}
            </div>
          ) : null}

          {!supportsServiceManagement ? null : !running ? (
            !isServiceMode ? (
              <div className="space-y-4">
                <div className="rounded-md border border-border/40 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <CircleDot className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">未运行</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    xpod 当前没有运行。请在登录页选择本地空间或独立空间启动。
                  </div>
                </div>
              </div>
            ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>空间类型</Label>
                <Tabs value={spaceKind} onValueChange={(v) => setSpaceKind(v as ServiceSpaceKind)}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="local">本地空间</TabsTrigger>
                    <TabsTrigger value="standalone">独立空间</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="space-y-2">
                <Label>1) 数据地址</Label>
                <Input value={dataDir} onChange={(e) => setDataDir(e.target.value)} placeholder="选择一个用于保存本地数据的文件夹" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="service-auto-start">2) 开机自动启动</Label>
                  <Switch id="service-auto-start" checked={autoStart} onCheckedChange={setAutoStart} />
                </div>
              </div>

              {spaceKind === 'local' ? (
                <>
                  <div className="space-y-2">
                    <Label>3) 公网域名（可选）</Label>
                    <Input value={publicDomain} onChange={(e) => setPublicDomain(e.target.value)} placeholder="pod.example.com" />
                    <div className="text-xs text-muted-foreground">留空时由 LinX 自动分配可登录地址；只有要使用自有 HTTPS 域名时才填写。</div>
                    <div className="text-xs text-muted-foreground">需要外网访问时，可配置自有域名或隧道。</div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label>3) 公网域名（可选）</Label>
                  <Input value={publicDomain} onChange={(e) => setPublicDomain(e.target.value)} placeholder="pod.example.com" />
                  <div className="text-xs text-muted-foreground">留空时只在本机或局域网使用；需要公网访问时再填你自己的域名。</div>
                </div>
              )}

              {spaceKind === 'local' ? (
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

              {spaceKind === 'local' ? (
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
                    <Label>隧道密钥</Label>
                    <Input
                      value={tunnelToken}
                      onChange={(e) => setTunnelToken(e.target.value)}
                      placeholder={initialHasTunnelToken && tunnelProvider === initialTunnelProvider ? '留空则沿用已保存密钥' : '必填'}
                    />
                    {initialHasTunnelToken && tunnelProvider === initialTunnelProvider ? (
                      <div className="text-xs text-muted-foreground">已检测到本机已保存密钥（不会显示明文）。</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              ) : null}

              <div className="space-y-2">
                <Label>{spaceKind === 'local' ? '6) HTTPS 证书' : '4) HTTPS 证书（可选）'}</Label>
                <Input value={httpsCertPath} onChange={(e) => setHttpsCertPath(e.target.value)} placeholder="证书路径（例如 /path/to/fullchain.pem）" />
              </div>

              <Button onClick={saveAndStart} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                保存并启动服务
              </Button>
            </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-border/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CircleDot className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium">运行中</span>
                  <Badge variant="secondary" className="ml-auto">
                    {status?.pod?.publicUrl ? '公网地址' : '本地地址'}
                  </Badge>
                </div>
                <div className="text-xs font-mono text-muted-foreground break-all">{podBaseUrl || '未获取到访问地址'}</div>
              </div>

              {runtime?.currentVersion || runtime?.targetVersion ? (
                <div className="rounded-md border border-border/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">xpod runtime</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="secondary">当前 {runtime.currentVersion || '未知'}</Badge>
                        {runtime.targetVersion ? <Badge variant="outline">目标 {runtime.targetVersion}</Badge> : null}
                      </div>
                    </div>
                    {canUpgradeXpod ? (
                      <Button onClick={upgradeXpodRuntime} disabled={submitting} size="sm">
                        {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                        升级 xpod
                      </Button>
                    ) : (
                      <Badge variant="outline">无需升级</Badge>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-2">
                <Button className="justify-start" onClick={() => openExternal(`${podBaseUrl}/app/`)} disabled={!podBaseUrl}>
                  <ExternalLink className="h-4 w-4 mr-2" /> 打开本地空间应用
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => openExternal(`${podBaseUrl}/dashboard/`)} disabled={!podBaseUrl}>
                  <ExternalLink className="h-4 w-4 mr-2" /> 打开本地空间管理页
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => runXpodAction('restart', '/api/service/restart')} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCw className="h-4 w-4 mr-2" />}
                  重启
                </Button>
                <Button variant="destructive" onClick={() => runXpodAction('stop', '/api/service/stop')} disabled={submitting}>
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
