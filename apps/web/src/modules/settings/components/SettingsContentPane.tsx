import type { MicroAppPaneProps, ThemeMode } from '@/modules/layout/micro-app-registry'
import { useThemeMode } from '@/modules/layout/use-theme-mode'
import { useAppUpdateStatus } from '@/modules/layout/use-app-update-status'
import { getRuntimeShellInfo } from '@/lib/runtime-shell'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSettingsStore } from '../store'
import { requestOpenServiceManagement } from '../events'
import { ShellStatusBadge } from '@/components/ShellStatusBadge'
import { Bot, CheckCircle2, ExternalLink, Loader2, MonitorCog, Moon, Palette, RefreshCcw, Sun, Wrench } from 'lucide-react'

function ThemeCard() {
  const [theme, toggleTheme, setTheme] = useThemeMode()

  const themeButton = (value: ThemeMode, label: string, icon: typeof Sun) => {
    const Icon = icon
    const active = theme === value
    return (
      <Button
        variant={active ? 'default' : 'outline'}
        className="justify-start gap-2"
        onClick={() => setTheme(value)}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Button>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-4 w-4" />
          主题
        </CardTitle>
        <CardDescription>桌面壳和共享 Web 应用共用同一主题偏好。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {themeButton('light', '浅色', Sun)}
          {themeButton('dark', '深色', Moon)}
        </div>
        <Button variant="ghost" className="justify-start px-0 text-muted-foreground" onClick={toggleTheme}>
          当前：{theme === 'dark' ? '深色模式' : '浅色模式'}，点击快速切换
        </Button>
      </CardContent>
    </Card>
  )
}

function UpdatesCard() {
  const appUpdate = useAppUpdateStatus()
  const hasRelease = Boolean(appUpdate.status.releaseUrl)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCcw className="h-4 w-4" />
          版本更新
        </CardTitle>
        <CardDescription>检查 GitHub Release，并在有新版本时跳转发布页。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">当前 {appUpdate.status.currentVersion}</Badge>
          {appUpdate.status.available && appUpdate.status.latestVersion ? (
            <Badge className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              最新 {appUpdate.status.latestVersion}
            </Badge>
          ) : (
            <Badge variant="secondary">暂无更新</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void appUpdate.refresh(true, 'manual')} disabled={appUpdate.isChecking}>
            {appUpdate.isChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            检查更新
          </Button>
          <Button variant="outline" onClick={() => void appUpdate.openReleasePage()} disabled={!hasRelease}>
            <ExternalLink className="mr-2 h-4 w-4" />
            打开发布页
          </Button>
        </div>
        {appUpdate.status.checkedAt ? (
          <p className="text-xs text-muted-foreground">上次检查：{new Date(appUpdate.status.checkedAt).toLocaleString()}</p>
        ) : null}
        {appUpdate.status.error ? (
          <p className="text-xs text-destructive">{appUpdate.status.error}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RuntimeCard() {
  const navigate = useNavigate()
  const shell = getRuntimeShellInfo()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MonitorCog className="h-4 w-4" />
          运行环境
        </CardTitle>
        <CardDescription>当前壳、认证方式，以及与本地服务相关的入口。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <ShellStatusBadge />
          <div className="text-sm text-muted-foreground">
            <div>{shell.description}</div>
            <div>{shell.authLabel}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate({ to: '/$microAppId', params: { microAppId: 'model-services' } })}>
            <Bot className="mr-2 h-4 w-4" />
            打开模型服务
          </Button>
          <Button variant="outline" onClick={() => requestOpenServiceManagement()}>
            <Wrench className="mr-2 h-4 w-4" />
            打开服务管理
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SettingsContentPane({}: MicroAppPaneProps) {
  const selectedSection = useSettingsStore((state) => state.selectedSection)

  if (selectedSection === 'updates') {
    return (
      <div className="h-full overflow-y-auto bg-layout-content px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <UpdatesCard />
        </div>
      </div>
    )
  }

  if (selectedSection === 'runtime') {
    return (
      <div className="h-full overflow-y-auto bg-layout-content px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <RuntimeCard />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-layout-content px-6 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <ThemeCard />
        <UpdatesCard />
        <RuntimeCard />
      </div>
    </div>
  )
}
