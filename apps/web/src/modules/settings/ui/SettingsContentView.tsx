import type { ReactNode } from 'react'
import { Bot, CheckCircle2, ExternalLink, Loader2, MonitorCog, Moon, Palette, RefreshCcw, Sun, Wrench } from 'lucide-react'
import { ShellStatusBadge } from '@/components/ShellStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AppUpdateStatus } from '@/types/electron-api'
import type { SettingsSectionId } from '../domain/section-model'

type SettingsThemeMode = 'light' | 'dark'

export interface SettingsContentViewProps {
  selectedSection: SettingsSectionId
  theme: SettingsThemeMode
  updateStatus: AppUpdateStatus
  updateChecking: boolean
  releaseAvailable: boolean
  updateCheckedAtLabel: string | null
  shell: {
    description: string
    authLabel: string
  }
  networkContent: ReactNode
  selectTheme: (theme: SettingsThemeMode) => void
  toggleTheme: () => void
  checkForUpdates: () => Promise<void>
  openReleasePage: () => Promise<void>
  openModelServices: () => void
  openServiceManagement: () => void
}

export function SettingsContentView(props: SettingsContentViewProps) {
  let content: ReactNode
  if (props.selectedSection === 'updates') {
    content = <UpdatesCard {...props} />
  } else if (props.selectedSection === 'runtime') {
    content = <RuntimeCard {...props} />
  } else if (props.selectedSection === 'network') {
    content = props.networkContent
  } else {
    content = (
      <>
        <ThemeCard {...props} />
        <UpdatesCard {...props} />
        <RuntimeCard {...props} />
      </>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-layout-content px-6 py-6">
      <div className="mx-auto max-w-3xl space-y-6">{content}</div>
    </div>
  )
}

function ThemeCard({ theme, selectTheme, toggleTheme }: SettingsContentViewProps) {
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
          <Button
            variant={theme === 'light' ? 'default' : 'outline'}
            className="justify-start gap-2"
            onClick={() => selectTheme('light')}
          >
            <Sun className="h-4 w-4" />
            浅色
          </Button>
          <Button
            variant={theme === 'dark' ? 'default' : 'outline'}
            className="justify-start gap-2"
            onClick={() => selectTheme('dark')}
          >
            <Moon className="h-4 w-4" />
            深色
          </Button>
        </div>
        <Button variant="ghost" className="justify-start px-0 text-muted-foreground" onClick={toggleTheme}>
          当前：{theme === 'dark' ? '深色模式' : '浅色模式'}，点击快速切换
        </Button>
      </CardContent>
    </Card>
  )
}

function UpdatesCard({
  updateStatus,
  updateChecking,
  releaseAvailable,
  updateCheckedAtLabel,
  checkForUpdates,
  openReleasePage,
}: SettingsContentViewProps) {
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
          <Badge variant="outline">当前 {updateStatus.currentVersion}</Badge>
          {updateStatus.available && updateStatus.latestVersion ? (
            <Badge className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              最新 {updateStatus.latestVersion}
            </Badge>
          ) : <Badge variant="secondary">暂无更新</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void checkForUpdates()} disabled={updateChecking}>
            {updateChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            检查更新
          </Button>
          <Button variant="outline" onClick={() => void openReleasePage()} disabled={!releaseAvailable}>
            <ExternalLink className="mr-2 h-4 w-4" />
            打开发布页
          </Button>
        </div>
        {updateCheckedAtLabel ? (
          <p className="text-xs text-muted-foreground">上次检查：{updateCheckedAtLabel}</p>
        ) : null}
        {updateStatus.error ? <p className="text-xs text-destructive">{updateStatus.error}</p> : null}
      </CardContent>
    </Card>
  )
}

function RuntimeCard({ shell, openModelServices, openServiceManagement }: SettingsContentViewProps) {
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
          <Button variant="outline" onClick={openModelServices}>
            <Bot className="mr-2 h-4 w-4" />
            打开模型服务
          </Button>
          <Button variant="outline" onClick={openServiceManagement}>
            <Wrench className="mr-2 h-4 w-4" />
            打开服务管理
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
