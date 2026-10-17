import type { ReactNode } from 'react'
import { ChevronLeft, ExternalLink, Loader2 } from 'lucide-react'
import { ShellStatusBadge } from '@/components/ShellStatusBadge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { StartupView } from '@/lib/micro-apps/startup'
import type { AppUpdateStatus } from '@/types/electron-api'
import type { AppearancePreference as ThemePreference } from '../domain/notification-model'
import type { NotificationPrefKey, NotificationPrefs } from '../domain/notification-model'
import { SETTINGS_SECTIONS, settingsSectionTitle, type SettingsSectionId } from '../domain/section-model'
import { AdvancedDisclosure } from './AdvancedDisclosure'
import { SettingsNavigation } from './SettingsNavigation'

export interface SettingsContentViewProps {
  selectedSection: SettingsSectionId
  themePreference: ThemePreference
  updateStatus: AppUpdateStatus
  updateChecking: boolean
  releaseAvailable: boolean
  updateCheckedAtLabel: string | null
  isDesktop: boolean
  shell: {
    label: string
    description: string
    authLabel: string
  }
  notificationPrefs: NotificationPrefs
  /** 开机自动打开: only on the desktop app (`available`). */
  autoLaunch: { available: boolean; enabled: boolean | null; setEnabled: (enabled: boolean) => void }
  startupView: StartupView
  setStartupView: (view: StartupView) => void
  networkContent: ReactNode
  spaceContent?: ReactNode
  /** Narrow windows show one level at a time: the section list, then one section. */
  compact: boolean
  showSectionList: boolean
  navigationHints: Partial<Record<SettingsSectionId, string>>
  onSelectSection: (section: SettingsSectionId) => void
  onBack: () => void
  runtimeAdvancedOpen: boolean
  setRuntimeAdvancedOpen: (open: boolean) => void
  selectTheme: (theme: ThemePreference) => void
  setNotificationPref: (key: NotificationPrefKey, value: boolean) => void
  checkForUpdates: () => Promise<void>
  openReleasePage: () => Promise<void>
  openModelServices: () => void
  openServiceManagement: () => void
}

export function SettingsContentView(props: SettingsContentViewProps) {
  if (props.compact && props.showSectionList) {
    return (
      <div className="flex h-full flex-col bg-layout-list-item">
        <SettingsNavigation
          items={SETTINGS_SECTIONS}
          selectedId={props.selectedSection}
          onSelect={props.onSelectSection}
          trailing={props.navigationHints}
        />
      </div>
    )
  }

  let content: ReactNode
  switch (props.selectedSection) {
    case 'space':
      content = props.spaceContent ?? null
      break
    case 'models':
      content = <ModelsSection {...props} />
      break
    case 'runtime':
      content = <RuntimeSection {...props} />
      break
    case 'network':
      content = props.networkContent
      break
    case 'updates':
      content = <UpdatesSection {...props} />
      break
    case 'about':
      content = <AboutSection {...props} />
      break
    default:
      content = <GeneralSection {...props} />
  }

  return (
    <div className="h-full overflow-y-auto bg-layout-content">
      {props.compact ? (
        <div className="sticky top-0 z-10 flex h-12 items-center gap-1 border-b border-border bg-layout-content px-2">
          <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={props.onBack}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            设置
          </Button>
          <span className="flex-1 truncate text-center text-sm font-medium">
            {settingsSectionTitle(props.selectedSection)}
          </span>
          <span className="w-16" aria-hidden="true" />
        </div>
      ) : null}
      <div className="mx-auto max-w-2xl space-y-6 px-5 py-6">
        {props.compact ? null : (
          <h2 className="text-lg font-semibold">{settingsSectionTitle(props.selectedSection)}</h2>
        )}
        {content}
      </div>
    </div>
  )
}

export function SettingsGroup({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-1.5">
      {title ? <h3 className="px-1 text-xs text-muted-foreground">{title}</h3> : null}
      <div className="overflow-hidden rounded-lg border border-border bg-card [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-border/50">
        {children}
      </div>
      {note ? <p className="px-1 text-xs leading-5 text-muted-foreground">{note}</p> : null}
    </section>
  )
}

export function SettingsRow({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">{children}</span>
    </div>
  )
}

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string }> = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
]

const NOTIFICATION_ROWS: Array<{ key: NotificationPrefKey; label: string }> = [
  { key: 'newMessages', label: '新消息' },
  { key: 'needsDecision', label: '有事等你决定' },
  { key: 'taskFailed', label: '持续任务没成功' },
  { key: 'showContent', label: '通知里显示内容' },
]

function GeneralSection({ themePreference, selectTheme, notificationPrefs, setNotificationPref, autoLaunch, startupView, setStartupView }: SettingsContentViewProps) {
  return (
    <>
      <SettingsGroup title="外观" note="桌面版和网页版用同一个外观设置。">
        <div role="radiogroup" aria-label="外观" className="flex gap-1 p-1.5">
          {THEME_OPTIONS.map((option) => {
            const selected = themePreference === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn(
                  'h-8 flex-1 rounded-md text-sm transition-colors',
                  selected ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60',
                )}
                onClick={() => selectTheme(option.id)}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <SettingsRow label="语言">简体中文</SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="启动">
        {autoLaunch.available ? (
          <SettingsRow label="开机自动打开">
            <Switch
              aria-label="开机自动打开"
              checked={autoLaunch.enabled === true}
              disabled={autoLaunch.enabled === null}
              onCheckedChange={autoLaunch.setEnabled}
            />
          </SettingsRow>
        ) : null}
        <SettingsRow label="启动时打开">
          <select
            aria-label="启动时打开"
            value={startupView}
            onChange={(event) => setStartupView(event.target.value as StartupView)}
            className="h-7 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="last">上次的位置</option>
            <option value="chat">聊天</option>
          </select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="通知" note="免打扰的会话不通知。关掉“显示内容”时，通知只写“你有新消息”。">
        {NOTIFICATION_ROWS.map((row) => (
          <SettingsRow key={row.key} label={row.label}>
            <Switch
              aria-label={row.label}
              checked={notificationPrefs[row.key]}
              onCheckedChange={(checked) => setNotificationPref(row.key, checked)}
            />
          </SettingsRow>
        ))}
      </SettingsGroup>

      <SettingsGroup title="发送">
        <SettingsRow label="发送消息">Enter（Shift + Enter 换行）</SettingsRow>
      </SettingsGroup>
    </>
  )
}

function ModelsSection({ openModelServices }: SettingsContentViewProps) {
  return (
    <SettingsGroup note="LinX 和助手用到的 AI 模型，在这里连接和管理。">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="text-sm">管理模型连接</span>
        <Button variant="outline" size="sm" onClick={openModelServices}>打开模型连接</Button>
      </div>
    </SettingsGroup>
  )
}

function RuntimeSection({
  isDesktop,
  shell,
  openServiceManagement,
  runtimeAdvancedOpen,
  setRuntimeAdvancedOpen,
}: SettingsContentViewProps) {
  return (
    <>
      <SettingsGroup note={isDesktop ? '停止后，存在这台电脑上的聊天和文件暂时打不开。云端空间不受影响。' : '本机服务只在桌面版里管理。'}>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm">{isDesktop ? '查看、重启或停止本机服务' : '当前是网页版'}</span>
          {isDesktop ? (
            <Button variant="outline" size="sm" onClick={openServiceManagement}>管理本机服务</Button>
          ) : null}
        </div>
      </SettingsGroup>
      <AdvancedDisclosure open={runtimeAdvancedOpen} onOpenChange={setRuntimeAdvancedOpen} label="高级">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <ShellStatusBadge />
          <div className="text-sm text-muted-foreground">
            <div>{shell.description}</div>
            <div>{shell.authLabel}</div>
          </div>
        </div>
      </AdvancedDisclosure>
    </>
  )
}

function UpdateActions({
  updateStatus,
  updateChecking,
  releaseAvailable,
  updateCheckedAtLabel,
  checkForUpdates,
  openReleasePage,
}: SettingsContentViewProps) {
  const headline = updateStatus.error
    ? '没检查成功'
    : updateStatus.available && updateStatus.latestVersion
      ? `有新版本 ${updateStatus.latestVersion}`
      : '已是最新'
  return (
    <>
      <SettingsGroup>
        <SettingsRow label={`LinX ${updateStatus.currentVersion}`}>
          <span className={updateStatus.available ? 'font-medium text-foreground' : undefined}>{headline}</span>
        </SettingsRow>
        <SettingsRow label="上次检查">{updateCheckedAtLabel ?? '还没检查过'}</SettingsRow>
      </SettingsGroup>
      {updateStatus.error ? <p className="px-1 text-xs text-destructive">网络问题，稍后重试。</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void checkForUpdates()} disabled={updateChecking}>
          {updateChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {updateStatus.error ? '重试' : '检查更新'}
        </Button>
        <Button variant="outline" onClick={() => void openReleasePage()} disabled={!releaseAvailable}>
          <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
          {updateStatus.available ? '更新内容' : '打开发布页'}
        </Button>
      </div>
    </>
  )
}

function UpdatesSection(props: SettingsContentViewProps) {
  return <UpdateActions {...props} />
}

function AboutSection(props: SettingsContentViewProps) {
  return (
    <>
      <SettingsGroup>
        <SettingsRow label="版本">
          {props.updateStatus.currentVersion}（{props.shell.label}）
        </SettingsRow>
        <SettingsRow label="登录方式">{props.shell.authLabel}</SettingsRow>
      </SettingsGroup>
      <UpdateActions {...props} />
    </>
  )
}
