import { AlertCircle, CheckCircle2, Loader2, RefreshCcw, Server } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ServiceSpaceKind, TunnelProvider } from '../domain/types'
import type { SetupDraft } from '../domain/setup-model'
import { AdvancedDisclosure } from './AdvancedDisclosure'

export interface SetupViewUIProps {
  isServiceMode: boolean
  loading: boolean
  saving: boolean
  error: string | null
  success: string | null
  advancedOpen: boolean
  draft: SetupDraft
  effectivePublicDomain: string
  updateDraft: (patch: Partial<SetupDraft>) => void
  setAdvancedOpen: (open: boolean) => void
  reload: () => Promise<void>
  save: () => Promise<void>
  returnToMain: () => void
}

export function SetupView({
  isServiceMode,
  loading,
  saving,
  error,
  success,
  advancedOpen,
  draft,
  effectivePublicDomain,
  updateDraft,
  setAdvancedOpen,
  reload,
  save,
  returnToMain,
}: SetupViewUIProps) {
  if (!isServiceMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-lg rounded-2xl border-border/50">
          <CardHeader>
            <CardTitle>该入口仅用于 LinX 服务</CardTitle>
            <CardDescription>当前入口不能使用首次配置页。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={returnToMain}>返回主界面</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const reusableTunnelToken = draft.initialHasTunnelToken
    && draft.initialTunnelProvider === draft.tunnelProvider

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-xl rounded-2xl border-border/50 shadow-lg shadow-black/5">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>首次配置 LinX 服务</CardTitle>
              <CardDescription>这里只保存配置，不会自动启动本机空间。</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">保存到本机配置</Badge>
            <Badge variant="outline">本机空间默认自动分配登录地址</Badge>
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
            <div className="flex items-start gap-2 rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{success}</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>空间类型</Label>
            <Tabs
              value={draft.spaceKind}
              onValueChange={(value) => updateDraft({ spaceKind: value as ServiceSpaceKind })}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="local">本机空间</TabsTrigger>
                <TabsTrigger value="standalone">独立空间</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2">
            <Label htmlFor="setup-data-dir">数据目录</Label>
            <Input
              id="setup-data-dir"
              value={draft.dataDir}
              onChange={(event) => updateDraft({ dataDir: event.target.value })}
              placeholder="选择一个用于保存本地数据的文件夹"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-3">
            <div className="space-y-1">
              <Label htmlFor="setup-auto-start">开机自动启动</Label>
              <div className="text-xs text-muted-foreground">只保存配置，不会直接修改正在运行的服务。</div>
            </div>
            <Switch
              id="setup-auto-start"
              checked={draft.autoStart}
              onCheckedChange={(autoStart) => updateDraft({ autoStart })}
            />
          </div>

          <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
            {draft.spaceKind === 'local'
              ? 'LinX 自动分配可登录地址；自有域名、证书和隧道可在高级网络设置中配置。'
              : '独立空间默认使用本机或局域网入口；公网域名和证书可稍后配置。'}
          </div>

          <AdvancedDisclosure open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <div className="space-y-5">
              <div className="space-y-3 rounded-xl border border-border/50 p-4">
                <div className="space-y-2">
                  <Label htmlFor="setup-public-domain">
                    {draft.spaceKind === 'local' ? '自有公网域名（可选）' : '公网域名（可选）'}
                  </Label>
                  <Input
                    id="setup-public-domain"
                    value={draft.publicDomain}
                    onChange={(event) => updateDraft({ publicDomain: event.target.value })}
                    placeholder="pod.example.com"
                  />
                  <div className="text-xs text-muted-foreground">
                    {draft.spaceKind === 'local'
                      ? '留空时由 LinX 自动分配可登录地址；需要外网访问时，可配置自有域名或隧道。'
                      : '留空时只在本机或局域网使用；需要公网访问时再填你自己的域名。'}
                  </div>
                </div>
              </div>

              {draft.spaceKind === 'standalone' ? (
                <div className="space-y-2">
                  <Label htmlFor="setup-https-cert-path">HTTPS 证书路径（可选）</Label>
                  <Input
                    id="setup-https-cert-path"
                    value={draft.httpsCertPath}
                    onChange={(event) => updateDraft({ httpsCertPath: event.target.value })}
                    placeholder="/path/to/fullchain.pem"
                  />
                </div>
              ) : null}

              {draft.spaceKind === 'local' ? (
                <div className="space-y-3 rounded-xl border border-border/50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label htmlFor="setup-auto-detect-public-ip">自动检测公网 IP</Label>
                      <div className="text-xs text-muted-foreground">只用于提示网络条件；没有公网 IP 时仍可先本机/局域网使用。</div>
                    </div>
                    <Switch
                      id="setup-auto-detect-public-ip"
                      checked={draft.autoDetectPublicIp}
                      onCheckedChange={(autoDetectPublicIp) => updateDraft({ autoDetectPublicIp })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>隧道供应商（可选）</Label>
                    <Select
                      value={draft.tunnelProvider || 'none'}
                      onValueChange={(value) => updateDraft({
                        tunnelProvider: value === 'none' ? '' : value as TunnelProvider,
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">不使用隧道</SelectItem>
                        <SelectItem value="cloudflare">cloudflare</SelectItem>
                        <SelectItem value="sakura">sakura frp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {draft.tunnelProvider ? (
                    <div className="space-y-2">
                      <Label htmlFor="setup-tunnel-token">隧道密钥</Label>
                      <Input
                        id="setup-tunnel-token"
                        type="password"
                        value={draft.tunnelToken}
                        onChange={(event) => updateDraft({ tunnelToken: event.target.value })}
                        placeholder={reusableTunnelToken ? '留空则沿用已保存密钥' : '请输入密钥'}
                      />
                      {reusableTunnelToken ? (
                        <div className="text-xs text-muted-foreground">已检测到当前供应商的已保存密钥。</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </AdvancedDisclosure>

          <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            生效地址：{draft.spaceKind === 'local'
              ? (effectivePublicDomain ? `https://${effectivePublicDomain}` : '自动分配登录地址')
              : (effectivePublicDomain ? `https://${effectivePublicDomain}` : '本机或局域网入口')}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void reload()} variant="outline" disabled={loading || saving}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              重新读取
            </Button>
            <Button onClick={() => void save()} disabled={loading || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存配置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
