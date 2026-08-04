import { CircleDot, Download, ExternalLink, Loader2, Play, RotateCw, Server, Square } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ServiceRuntimeStatus, ServiceStatus } from '../domain/service-model'
import type { SetupDraft } from '../domain/setup-model'
import type { ServiceSpaceKind, TunnelProvider } from '../domain/types'
import { AdvancedDisclosure } from './AdvancedDisclosure'

export interface ServiceManagementDialogUIProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  submitting: boolean
  error: string | null
  status: ServiceStatus | null
  draft: SetupDraft
  serviceSetupReady: boolean
  hasPublicIp: boolean | null
  advancedOpen: boolean
  running: boolean
  podBaseUrl: string
  runtime: ServiceRuntimeStatus | undefined
  isServiceMode: boolean
  supportsServiceManagement: boolean
  canUpgradeXpod: boolean
  tunnelSuggested: boolean
  updateDraft: (patch: Partial<SetupDraft>) => void
  setAdvancedOpen: (open: boolean) => void
  saveAndStart: () => Promise<void>
  runRuntimeAction: (action: 'stop' | 'restart') => Promise<void>
  upgradeRuntime: () => Promise<void>
  openExternalUrl: (url: string) => Promise<void>
}

export function ServiceManagementDialog({
  open,
  onOpenChange,
  loading,
  submitting,
  error,
  status,
  draft,
  serviceSetupReady,
  hasPublicIp,
  advancedOpen,
  running,
  podBaseUrl,
  runtime,
  isServiceMode,
  supportsServiceManagement,
  canUpgradeXpod,
  tunnelSuggested,
  updateDraft,
  setAdvancedOpen,
  saveAndStart,
  runRuntimeAction,
  upgradeRuntime,
  openExternalUrl,
}: ServiceManagementDialogUIProps) {
  const useTunnel = draft.spaceKind === 'local' && Boolean(draft.tunnelProvider)
  const reusableTunnelToken = draft.initialHasTunnelToken
    && draft.tunnelProvider === draft.initialTunnelProvider

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden rounded-lg border-border/30 bg-background p-0">
        <DialogTitle className="sr-only">xpod 状态</DialogTitle>
        <DialogDescription className="sr-only">查看本地 xpod 状态并执行明确的启动、重启、停止或升级操作。</DialogDescription>
        <div className="border-b border-border/30 bg-muted/20 p-6">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-md bg-primary">
              <Server className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">xpod 状态</div>
              <div className="text-xs text-muted-foreground">查看本地 xpod 状态；检测到新版本时可手动升级。</div>
              <div className="text-xs text-muted-foreground">外网访问可选配置自有域名或隧道。</div>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-6">
          {!supportsServiceManagement ? (
            <div className="text-sm text-muted-foreground">当前入口不支持 xpod 状态管理。</div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在读取服务状态...
            </div>
          ) : null}

          {error ? <div className="text-sm text-destructive">{error}</div> : null}

          {!supportsServiceManagement ? null : !running ? (
            !isServiceMode ? (
              <div className="rounded-md border border-border/40 p-4">
                <div className="flex items-center gap-2">
                  <CircleDot className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">未运行</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  xpod 当前没有运行。请在登录页选择本机空间或独立空间启动。
                </div>
              </div>
            ) : !serviceSetupReady ? null : (
              <div className="space-y-4">
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
                  <Label htmlFor="service-data-dir">1) 数据地址</Label>
                  <Input
                    id="service-data-dir"
                    value={draft.dataDir}
                    onChange={(event) => updateDraft({ dataDir: event.target.value })}
                    placeholder="选择一个用于保存本地数据的文件夹"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="service-auto-start">2) 开机自动启动</Label>
                  <Switch
                    id="service-auto-start"
                    checked={draft.autoStart}
                    onCheckedChange={(autoStart) => updateDraft({ autoStart })}
                  />
                </div>

                <AdvancedDisclosure open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="service-public-domain">3) 公网域名（可选）</Label>
                      <Input
                        id="service-public-domain"
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

                    {draft.spaceKind === 'local' ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="auto-check">4) 自动检查公网 IP</Label>
                          <Switch
                            id="auto-check"
                            checked={draft.autoDetectPublicIp}
                            onCheckedChange={(autoDetectPublicIp) => updateDraft({ autoDetectPublicIp })}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {draft.autoDetectPublicIp
                            ? `检测结果：${hasPublicIp === null ? '检测中...' : hasPublicIp ? '有公网 IP（可直接配置公网入口）' : '无公网 IP（仍可本机/局域网使用，外网访问再配隧道）'}`
                            : '已关闭自动检测，将强制使用隧道供应商。'}
                        </div>
                      </div>
                    ) : null}

                    {draft.spaceKind === 'local' ? (
                      <div className="space-y-2">
                        <Label>
                          5) 隧道供应商{tunnelSuggested ? '（建议，外网访问时需要）' : '（可选）'}
                        </Label>
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

                        {useTunnel ? (
                          <div className="space-y-2 pt-2">
                            <Label htmlFor="service-tunnel-token">隧道密钥</Label>
                            <Input
                              id="service-tunnel-token"
                              type="password"
                              value={draft.tunnelToken}
                              onChange={(event) => updateDraft({ tunnelToken: event.target.value })}
                              placeholder={reusableTunnelToken ? '留空则沿用已保存密钥' : '必填'}
                            />
                            {reusableTunnelToken ? (
                              <div className="text-xs text-muted-foreground">已检测到本机已保存密钥（不会显示明文）。</div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor="service-cert-path">
                        {draft.spaceKind === 'local' ? '6) HTTPS 证书' : '4) HTTPS 证书（可选）'}
                      </Label>
                      <Input
                        id="service-cert-path"
                        value={draft.httpsCertPath}
                        onChange={(event) => updateDraft({ httpsCertPath: event.target.value })}
                        placeholder="证书路径（例如 /path/to/fullchain.pem）"
                      />
                    </div>
                  </div>
                </AdvancedDisclosure>

                <Button onClick={() => void saveAndStart()} disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  保存并启动服务
                </Button>
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="space-y-3 rounded-md border border-border/40 p-4">
                <div className="flex items-center gap-2">
                  <CircleDot className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium">运行中</span>
                  <Badge variant="secondary" className="ml-auto">
                    {status?.pod?.publicUrl ? '公网地址' : '本地地址'}
                  </Badge>
                </div>
                <div className="break-all font-mono text-xs text-muted-foreground">{podBaseUrl || '未获取到访问地址'}</div>
              </div>

              {runtime?.currentVersion || runtime?.targetVersion ? (
                <div className="rounded-md border border-border/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">xpod runtime</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="secondary">当前 {runtime.currentVersion || '未知'}</Badge>
                        {runtime.targetVersion ? <Badge variant="outline">目标 {runtime.targetVersion}</Badge> : null}
                      </div>
                    </div>
                    {canUpgradeXpod ? (
                      <Button onClick={() => void upgradeRuntime()} disabled={submitting} size="sm">
                        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        升级 xpod
                      </Button>
                    ) : <Badge variant="outline">无需升级</Badge>}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-2">
                <Button
                  className="justify-start"
                  onClick={() => void openExternalUrl(`${podBaseUrl}/app/`)}
                  disabled={!podBaseUrl}
                >
                  <ExternalLink className="mr-2 h-4 w-4" /> 打开本机空间应用
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => void openExternalUrl(`${podBaseUrl}/dashboard/`)}
                  disabled={!podBaseUrl}
                >
                  <ExternalLink className="mr-2 h-4 w-4" /> 打开本机空间管理页
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => void runRuntimeAction('restart')} disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
                  重启
                </Button>
                <Button variant="destructive" onClick={() => void runRuntimeAction('stop')} disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
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
