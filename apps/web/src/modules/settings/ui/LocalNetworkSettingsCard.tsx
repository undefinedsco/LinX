import { AlertCircle, CheckCircle2, Globe2, KeyRound, Loader2, RefreshCcw, Wifi } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LocalReachabilitySummary } from '@/modules/login/LocalReachabilitySummary'
import type { LocalOnboardingRouteProbe, LocalOnboardingSnapshot } from '@/types/electron-api'
import { hostFromUrl } from '../domain/network-model'
import { AdvancedDisclosure } from './AdvancedDisclosure'

export interface LocalNetworkSettingsCardUIProps {
  snapshot: LocalOnboardingSnapshot
  isDesktop: boolean
  loading: boolean
  busy: boolean
  publicDomain: string
  tunnelToken: string
  actionError: string | null
  success: string | null
  advancedOpen: boolean
  canonicalUrl: string | null
  localUrl: string | null
  serviceUrl: string | null
  hasSavedToken: boolean
  statusLabel: string
  updatePublicDomain: (value: string) => void
  setTunnelToken: (value: string) => void
  setAdvancedOpen: (open: boolean) => void
  refresh: () => Promise<void>
  save: () => Promise<void>
  testConnectivity: () => Promise<void>
}

export function LocalNetworkSettingsCard({
  snapshot,
  isDesktop,
  loading,
  busy,
  publicDomain,
  tunnelToken,
  actionError,
  success,
  advancedOpen,
  canonicalUrl,
  localUrl,
  serviceUrl,
  hasSavedToken,
  statusLabel,
  updatePublicDomain,
  setTunnelToken,
  setAdvancedOpen,
  refresh,
  save,
  testConnectivity,
}: LocalNetworkSettingsCardUIProps) {
  if (!isDesktop) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-4 w-4" />
            本地网络
          </CardTitle>
          <CardDescription>外部访问只在桌面版里设置。</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wifi className="h-4 w-4" />
                外部访问
              </CardTitle>
              <CardDescription>让手机和别的电脑也能打开这台电脑上的空间。</CardDescription>
            </div>
            <Badge variant={snapshot.state === 'ready' ? 'secondary' : 'outline'}>{statusLabel}</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {actionError ? <StatusNotice tone="error" message={actionError} /> : null}
          {success ? <StatusNotice tone="success" message={success} /> : null}

          <div className="grid gap-3 md:grid-cols-2">
            <EndpointPanel
              icon={Globe2}
              label="外面访问用的地址"
              value={canonicalUrl ?? '本机服务启动后自动分配'}
            />
            <EndpointPanel icon={Wifi} label="这台电脑上的地址" value={localUrl ?? '等待本机服务启动'} />
          </div>

          <AdvancedDisclosure open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="space-y-2">
                  <Label htmlFor="local-network-public-domain">我自己的域名（可选）</Label>
                  <Input
                    id="local-network-public-domain"
                    value={publicDomain}
                    onChange={(event) => updatePublicDomain(event.target.value)}
                    placeholder="pod.example.com"
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    留空就用 LinX 提供的地址。只有想换成自己的 HTTPS 域名时才填写。
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="space-y-2">
                  <Label htmlFor="local-network-tunnel-token">隧道密钥（可选）</Label>
                  <Input
                    id="local-network-tunnel-token"
                    type="password"
                    value={tunnelToken}
                    onChange={(event) => setTunnelToken(event.target.value)}
                    placeholder={hasSavedToken ? '留空则沿用已保存的密钥' : '粘贴密钥或完整的 cloudflared 命令'}
                  />
                  <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                    <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{hasSavedToken ? '已保存，不显示。' : '密钥只保存在这台电脑上，不会显示在页面上。'}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-background p-4">
                <div className="text-sm font-medium">隧道设置参考</div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  <InstructionRow
                    label="对外域名"
                    value={canonicalUrl ? hostFromUrl(canonicalUrl) : '等待分配'}
                  />
                  <InstructionRow label="服务地址" value={serviceUrl ?? '等待本机入口'} />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  “外部访问”只决定能不能连上；谁能看什么，由文件的共享决定。外面访问不到时，这台电脑上仍可正常使用。
                </p>
              </div>
            </div>
          </AdvancedDisclosure>

          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">外面能不能访问到</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  检查这台电脑上和外面各自能不能打开。
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void testConnectivity()} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                再检查
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
              <ProbeDetail label="这台电脑" probe={snapshot.connectivity?.local ?? null} />
              <ProbeDetail label="外面" probe={snapshot.connectivity?.public ?? null} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
            <Button variant="outline" onClick={() => void refresh()} disabled={busy}>
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
    <div className={tone === 'success'
      ? 'flex items-start gap-2 rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-sm text-success'
      : 'flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive'}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function EndpointPanel({ icon: Icon, label, value }: { icon: typeof Globe2; label: string; value: string }) {
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

function ProbeDetail({ label, probe }: { label: string; probe: LocalOnboardingRouteProbe | null }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-xs">
      <div className="font-medium">{label}</div>
      <div className="mt-1 break-all text-muted-foreground">{probe?.url ?? '尚未检测'}</div>
      {probe?.message ? <div className="mt-1 text-muted-foreground">{probe.message}</div> : null}
      {typeof probe?.latencyMs === 'number' ? <div className="mt-1 text-muted-foreground">{probe.latencyMs}ms</div> : null}
    </div>
  )
}
