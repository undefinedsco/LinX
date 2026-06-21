import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Globe2, KeyRound, Loader2, RefreshCcw, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { LocalReachabilitySummary } from '@/modules/login/LocalReachabilitySummary'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { useLocalOnboarding } from '@/modules/login/hooks/use-local-onboarding'
import type { LocalOnboardingRouteProbe, LocalOnboardingSnapshot } from '@/types/electron-api'

export function LocalNetworkSettingsCard() {
  const {
    snapshot,
    loading,
    acting,
    refresh,
    saveNetworkConfig,
    testConnectivity,
    isDesktop,
  } = useLocalOnboarding()
  const [publicDomain, setPublicDomain] = useState('')
  const [domainTouched, setDomainTouched] = useState(false)
  const [tunnelToken, setTunnelToken] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (domainTouched) return
    setPublicDomain(resolveCustomDomainInput(snapshot.publicUrl))
  }, [domainTouched, snapshot.publicUrl])

  if (!isDesktop) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-4 w-4" />
            本地网络
          </CardTitle>
          <CardDescription>本地网络设置只在桌面端可用。</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const canonicalUrl = snapshot.publicUrl
  const localUrl = snapshot.localUrl ?? snapshot.baseUrl
  const serviceUrl = resolveCloudflareServiceUrl(snapshot)
  const hasSavedToken = Boolean(snapshot.tunnel?.hasToken)
  const statusLabel = resolveStatusLabel(snapshot, loading)
  const busy = loading || acting

  async function handleRefresh() {
    setActionError(null)
    setSuccess(null)
    try {
      await refresh()
    } catch (error) {
      setActionError(formatLoginErrorForUser(error, '读取本地网络设置失败。请稍后重试。'))
    }
  }

  async function handleSave() {
    setActionError(null)
    setSuccess(null)
    try {
      const next = await saveNetworkConfig({
        publicDomain,
        tunnelProvider: 'cloudflare',
        tunnelToken: tunnelToken.trim() || undefined,
      })
      setTunnelToken('')
      if (next.errorCode) {
        setActionError(formatLoginErrorForUser(next.message, '网络配置没有保存。请检查后重试。'))
        return
      }
      setDomainTouched(false)
      setSuccess('网络配置已保存。')
    } catch (error) {
      setActionError(formatLoginErrorForUser(error, '网络配置没有保存。请检查后重试。'))
    }
  }

  async function handleConnectivityTest() {
    setActionError(null)
    setSuccess(null)
    try {
      await testConnectivity()
      setSuccess('可达性检测已完成。')
    } catch (error) {
      setActionError(formatLoginErrorForUser(error, '可达性检测失败。请稍后重试。'))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wifi className="h-4 w-4" />
                本地网络
              </CardTitle>
              <CardDescription>
                管理 Local 的 canonical 存储地址、隧道 token 和本机/公网可达性。
              </CardDescription>
            </div>
            <Badge variant={snapshot.state === 'ready' ? 'secondary' : 'outline'}>{statusLabel}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Cloud 负责账号</Badge>
            <Badge variant="outline">Local 负责数据</Badge>
            {snapshot.capabilities?.version ? <Badge variant="secondary">xpod {snapshot.capabilities.version}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {actionError ? (
            <StatusNotice tone="error" message={actionError} />
          ) : null}
          {success ? (
            <StatusNotice tone="success" message={success} />
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <EndpointPanel
              icon={Globe2}
              label="Cloud 分配的 Local 域名"
              value={canonicalUrl ?? '等待 Local 启动后由 Cloud 分配'}
            />
            <EndpointPanel
              icon={Wifi}
              label="本机入口"
              value={localUrl ?? '等待本机服务启动'}
            />
          </div>

          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="space-y-2">
              <Label htmlFor="local-network-public-domain">自有公网域名（可选）</Label>
              <Input
                id="local-network-public-domain"
                value={publicDomain}
                onChange={(event) => {
                  setDomainTouched(true)
                  setPublicDomain(event.target.value)
                }}
                placeholder="pod.example.com"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                留空使用 Cloud 分配的 Local 域名。只有你要把 canonical storage URL 换成自有 HTTPS 域名时才填写。
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="space-y-2">
              <Label htmlFor="local-network-tunnel-token">Cloudflare Tunnel token（可选）</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="local-network-tunnel-token"
                  type="password"
                  value={tunnelToken}
                  onChange={(event) => setTunnelToken(event.target.value)}
                  placeholder={hasSavedToken ? '留空则沿用已保存 token' : '粘贴 token 或完整 cloudflared 命令'}
                />
              </div>
              <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{hasSavedToken ? '已保存 token，不显示明文。' : 'token 只保存到本机 Local 配置，不会显示在页面上。'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background p-4">
            <div className="text-sm font-medium">Cloudflare 配置提示</div>
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
              <InstructionRow label="Public Hostname" value={canonicalUrl ? hostFromUrl(canonicalUrl) : '等待 Cloud 分配 Local 域名'} />
              <InstructionRow label="Service URL" value={serviceUrl ?? '等待本机入口'} />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              隧道只影响外网访问，不改变账号和数据归属。本机入口可用时，公网不可达也可以继续本机使用。
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">可达性验证</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  同时检测本机入口和公网 canonical URL，并校验是否指向同一个 Local 节点。
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleConnectivityTest} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                检测可达性
              </Button>
            </div>
            <LocalReachabilitySummary
              connectivity={snapshot.connectivity}
              assumeLocalReachable={snapshot.state === 'ready'}
              className="mt-4 bg-background/70"
            />
            {snapshot.connectivity?.message ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{snapshot.connectivity.message}</p>
            ) : null}
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <ProbeDetail label="本机入口" probe={snapshot.connectivity?.local ?? null} />
              <ProbeDetail label="公网入口" probe={snapshot.connectivity?.public ?? null} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSave} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存网络设置
            </Button>
            <Button variant="outline" onClick={handleRefresh} disabled={busy}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              重新读取
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusNotice({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div className={
      tone === 'success'
        ? 'flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400'
        : 'flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive'
    }>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function EndpointPanel({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Globe2
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 break-all text-sm font-medium">{value}</div>
    </div>
  )
}

function InstructionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="font-medium text-foreground">{label}</span>
      <span className="break-all font-mono">{value}</span>
    </div>
  )
}

function ProbeDetail({
  label,
  probe,
}: {
  label: string
  probe: LocalOnboardingRouteProbe | null
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-xs">
      <div className="font-medium">{label}</div>
      <div className="mt-1 break-all text-muted-foreground">{probe?.url ?? '尚未检测'}</div>
      {probe?.message ? <div className="mt-1 text-muted-foreground">{probe.message}</div> : null}
      {typeof probe?.latencyMs === 'number' ? <div className="mt-1 text-muted-foreground">{probe.latencyMs}ms</div> : null}
    </div>
  )
}

function resolveStatusLabel(snapshot: LocalOnboardingSnapshot, loading: boolean): string {
  if (loading) return '读取中'
  if (snapshot.state === 'ready') return '可用'
  if (snapshot.state === 'starting' || snapshot.state === 'checking') return '启动中'
  if (snapshot.state === 'error' || snapshot.state === 'repair_required') return '需要处理'
  return '未启动'
}

function resolveCustomDomainInput(publicUrl: string | null): string {
  if (!publicUrl) return ''
  const host = hostFromUrl(publicUrl)
  return host && !isManagedCloudDomain(host) ? host : ''
}

function hostFromUrl(value: string): string {
  try {
    return new URL(value).host
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  }
}

function resolveCloudflareServiceUrl(snapshot: LocalOnboardingSnapshot): string | null {
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
