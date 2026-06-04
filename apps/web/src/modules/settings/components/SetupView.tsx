import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Loader2, RefreshCcw, Server } from 'lucide-react'
import type { SetupConfig, ServiceSpaceKind, TunnelProvider, NetworkAccessMode } from '../types'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'

type DomainSource = 'manual'

type SetupConfigResponse = {
  dataDir?: string
  port?: number
  autoStart?: boolean
  spaceKind?: ServiceSpaceKind
  domainSource?: DomainSource
  publicDomain?: string
  autoDetectPublicIp?: boolean
  httpsCertPath?: string
  tunnelProvider?: TunnelProvider | ''
  hasTunnelToken?: boolean
}

interface SetupViewProps {
  onComplete?: (config: SetupConfig) => void
}

function normalizeDomain(value: string): string {
  return value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function ensureLocalDomainSource(): DomainSource {
  return 'manual'
}

async function parseError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null)
  if (typeof data?.error === 'string' && data.error.trim()) return data.error
  if (response.status >= 500) return '服务暂时没有响应。请稍后重试。'
  return '请求没有完成。请稍后重试。'
}

export function SetupView({ onComplete }: SetupViewProps) {
  const navigate = useNavigate()
  const isServiceMode =
    typeof window !== 'undefined' && !!(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [port, setPort] = useState(5737)
  const [dataDir, setDataDir] = useState('')
  const [autoStart, setAutoStart] = useState(true)
  const [spaceKind, setSpaceKind] = useState<ServiceSpaceKind>('local')
  const [domainSource, setDomainSource] = useState<DomainSource>('manual')
  const [publicDomain, setPublicDomain] = useState('')
  const [autoDetectPublicIp, setAutoDetectPublicIp] = useState(true)
  const [httpsCertPath, setHttpsCertPath] = useState('')
  const [tunnelProvider, setTunnelProvider] = useState<TunnelProvider | ''>('')
  const [tunnelToken, setTunnelToken] = useState('')
  const [initialTunnelProvider, setInitialTunnelProvider] = useState<TunnelProvider | ''>('')
  const [initialHasTunnelToken, setInitialHasTunnelToken] = useState(false)
  const useTunnel = spaceKind === 'local' && !!tunnelProvider

  useEffect(() => {
    const nextSource = ensureLocalDomainSource()
    if (nextSource !== domainSource) {
      setDomainSource(nextSource)
    }
  }, [spaceKind, domainSource, useTunnel])

  const loadConfig = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (!isServiceMode) {
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/setup/config')
      if (!response.ok) {
        throw new Error(await parseError(response))
      }

      const config = (await response.json()) as SetupConfigResponse
      setPort(config.port ?? 5737)
      setDataDir(config.dataDir ?? '')
      setAutoStart(config.autoStart ?? true)
      setSpaceKind(config.spaceKind ?? 'local')
      const nextAutoDetect = config.autoDetectPublicIp ?? true
      setAutoDetectPublicIp(nextAutoDetect)
      setDomainSource(ensureLocalDomainSource())
      setPublicDomain(config.publicDomain ?? '')
      setHttpsCertPath(config.httpsCertPath ?? '')
      setTunnelProvider(config.tunnelProvider ?? '')
      setInitialTunnelProvider(config.tunnelProvider ?? '')
      setInitialHasTunnelToken(Boolean(config.hasTunnelToken))
      setTunnelToken('')
    } catch (loadError) {
      setError(formatLoginErrorForUser(loadError, '读取配置失败。请稍后重试。'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadConfig()
  }, [])

  const effectivePublicDomain = useMemo(() => {
    return normalizeDomain(publicDomain)
  }, [publicDomain])

  const validate = (): string | null => {
    if (!dataDir.trim()) return '请填写数据目录'

    if (useTunnel) {
      const canReuseToken =
        initialHasTunnelToken && initialTunnelProvider === tunnelProvider && !tunnelToken.trim()
      if (!canReuseToken && !tunnelToken.trim()) {
        return '请填写隧道密钥，或沿用已保存密钥'
      }
    }

    return null
  }

  const buildPayload = () => {
    const normalizedPublicDomain = normalizeDomain(publicDomain)
    const accessMode: NetworkAccessMode = useTunnel ? 'tunnel' : 'auto'
    const effectiveTunnelToken =
      useTunnel && tunnelProvider
        ? (tunnelToken.trim() || undefined)
        : undefined

    return {
      dataDir: dataDir.trim(),
      port,
      autoStart,
      spaceKind,
      domainSource: 'manual',
      publicDomain: spaceKind === 'local' && normalizeDomain(publicDomain)
        ? normalizedPublicDomain || undefined
        : undefined,
      autoDetectPublicIp,
      httpsCertPath: spaceKind === 'standalone' ? (httpsCertPath.trim() || undefined) : undefined,
      network: {
        accessMode,
        tunnelProvider: useTunnel ? tunnelProvider || undefined : undefined,
        tunnelToken: effectiveTunnelToken,
      },
      local: {
        nodeId: undefined,
        deviceId: undefined,
      },
      standalone: {
        customDomain: spaceKind === 'standalone' ? normalizedPublicDomain || undefined : undefined,
      },
    }
  }

  const buildCompleteConfig = (): SetupConfig => {
    const payload = buildPayload()
    return {
      edition: 'local',
      spaceKind,
      pod: {
        port,
        dataDir: payload.dataDir,
      },
      local: {
        nodeId: payload.local.nodeId,
        deviceId: payload.local.deviceId,
      },
      standalone: {
        customDomain: payload.standalone.customDomain,
        certPath: payload.httpsCertPath,
      },
      network: {
        accessMode: payload.network.accessMode,
        tunnelProvider: payload.network.tunnelProvider,
        tunnelToken: payload.network.tunnelToken,
      },
      autoStart,
    }
  }

  const handleSave = async () => {
    setError(null)
    setSuccess(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)

    try {
      const payload = buildPayload()
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(await parseError(response))
      }

      onComplete?.(buildCompleteConfig())
      setSuccess('配置已保存，服务正在继续启动。')
    } catch (saveError) {
      setError(formatLoginErrorForUser(saveError, '保存配置失败。请检查配置后重试。'))
    } finally {
      setSaving(false)
    }
  }

  if (!isServiceMode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-lg rounded-2xl border-border/50">
          <CardHeader>
            <CardTitle>该入口仅用于 LinX 服务</CardTitle>
            <CardDescription>当前入口不能使用首次配置页。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate({ to: '/$microAppId', params: { microAppId: 'chat' } })}>
              返回主界面
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-xl rounded-2xl border-border/50 shadow-lg shadow-black/5">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>首次配置 LinX 服务</CardTitle>
              <CardDescription>这里只保存真实配置；保存后服务会继续启动本地空间与 LinX 界面。</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">保存到本机配置</Badge>
            <Badge variant="outline">本地空间默认自动分配登录地址</Badge>
            <Badge variant="outline">外网访问可稍后配置</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在读取当前配置...
            </div>
          ) : null}

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {success ? (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{success}</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>空间类型</Label>
            <Tabs value={spaceKind} onValueChange={(value) => setSpaceKind(value as ServiceSpaceKind)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="local">本地空间</TabsTrigger>
                <TabsTrigger value="standalone">独立空间</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2">
            <Label htmlFor="setup-data-dir">数据目录</Label>
            <Input
              id="setup-data-dir"
              value={dataDir}
              onChange={(event) => setDataDir(event.target.value)}
              placeholder="选择一个用于保存本地数据的文件夹"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-3">
            <div className="space-y-1">
              <Label htmlFor="setup-auto-start">开机自动启动</Label>
              <div className="text-xs text-muted-foreground">只保存配置，不会直接修改正在运行的服务。</div>
            </div>
            <Switch id="setup-auto-start" checked={autoStart} onCheckedChange={setAutoStart} />
          </div>

          {spaceKind === 'local' ? (
            <div className="space-y-3 rounded-xl border border-border/50 p-4">
              <div className="space-y-2">
                <Label>公网入口</Label>
                <div className="text-sm text-foreground">
                  留空时由 LinX 自动分配可登录地址；只有要使用自有 HTTPS 域名时才填写。
                </div>
                <div className="text-xs text-muted-foreground">需要外网访问时，可在高级设置里配置自有域名或隧道。</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-public-domain">自有公网域名（可选）</Label>
                <Input
                  id="setup-public-domain"
                  value={publicDomain}
                  onChange={(event) => setPublicDomain(event.target.value)}
                  placeholder="pod.example.com"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="setup-public-domain">公网域名（可选）</Label>
              <Input
                id="setup-public-domain"
                value={publicDomain}
                onChange={(event) => setPublicDomain(event.target.value)}
                placeholder="pod.example.com"
              />
              <div className="text-xs text-muted-foreground">留空时只在本机或局域网使用；需要公网访问时再填你自己的域名。</div>
            </div>
          )}

          {spaceKind === 'standalone' ? (
            <div className="space-y-2">
              <Label htmlFor="setup-https-cert-path">HTTPS 证书路径（可选）</Label>
              <Input
                id="setup-https-cert-path"
                value={httpsCertPath}
                onChange={(event) => setHttpsCertPath(event.target.value)}
                placeholder="/path/to/fullchain.pem"
              />
            </div>
          ) : null}

          {spaceKind === 'local' ? (
          <div className="space-y-3 rounded-xl border border-border/50 p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="setup-auto-detect-public-ip">自动检测公网 IP</Label>
                <div className="text-xs text-muted-foreground">只用于提示网络条件；没有公网 IP 时仍可先本机/局域网使用。</div>
              </div>
              <Switch
                id="setup-auto-detect-public-ip"
                checked={autoDetectPublicIp}
                onCheckedChange={setAutoDetectPublicIp}
              />
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>隧道供应商（可选）</Label>
                <Select
                  value={tunnelProvider || 'none'}
                  onValueChange={(value) =>
                    setTunnelProvider(value === 'none' ? '' : (value as TunnelProvider))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不使用隧道</SelectItem>
                    <SelectItem value="cloudflare">cloudflare</SelectItem>
                    <SelectItem value="sakura">sakura frp</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">
                  不配置隧道时，本地空间仍会启动并保证本机/局域网可用；之后可再补公网入口。
                </div>
              </div>

              {tunnelProvider ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="setup-tunnel-token">隧道密钥</Label>
                  <Input
                    id="setup-tunnel-token"
                    type="password"
                    value={tunnelToken}
                    onChange={(event) => setTunnelToken(event.target.value)}
                    placeholder={
                      initialHasTunnelToken && initialTunnelProvider === tunnelProvider
                        ? '留空则沿用已保存密钥'
                        : '请输入密钥'
                    }
                  />
                  {initialHasTunnelToken && initialTunnelProvider === tunnelProvider ? (
                    <div className="text-xs text-muted-foreground">已检测到当前供应商的已保存密钥。</div>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  未填写自有域名时，隧道会服务于 LinX 自动分配的登录地址。
                </div>
              </div>
                ) : null}
            </div>
          </div>
          ) : null}

          <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            生效地址：{spaceKind === 'local'
              ? (effectivePublicDomain ? `https://${effectivePublicDomain}` : '自动分配登录地址')
              : (effectivePublicDomain ? `https://${effectivePublicDomain}` : '本机或局域网入口')}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void loadConfig()} variant="outline" disabled={loading || saving}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              重新读取
            </Button>
            <Button onClick={handleSave} disabled={loading || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存配置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
