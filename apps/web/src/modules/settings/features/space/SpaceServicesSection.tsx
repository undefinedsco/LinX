import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { getRuntimeShellInfo } from '@/lib/runtime-shell'
import { useLinxDefaultSecretaryBootstrapSettling } from '@/modules/chat/collections'
import { useLocalOnboarding } from '@/modules/login/hooks/use-local-onboarding'
import { canSaveLabel } from '@/modules/profile/domain/space-status'
import { useSpaceStatus } from '@/modules/profile/useSpaceStatus'
import { useSession } from '@/providers/solid-session-context'
import { useSettingsStore } from '../../app/store'

function shortAccount(webId: string): string {
  try {
    const url = new URL(webId)
    const first = url.pathname.split('/').filter(Boolean)[0]
    return first && first !== 'profile' ? first : url.hostname
  } catch {
    return webId
  }
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-1.5">
      <h3 className="px-1 text-xs text-muted-foreground">{title}</h3>
      <div className="overflow-hidden rounded-lg border border-border bg-card">{children}</div>
    </section>
  )
}

function Row({ label, value, onClick, last }: { label: string; value: ReactNode; onClick?: () => void; last?: boolean }) {
  const content = (
    <>
      <span className="text-sm text-foreground">{label}</span>
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        {value}
        {onClick ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : null}
      </span>
    </>
  )
  const className = `flex w-full items-center justify-between px-4 py-3 text-left ${last ? '' : 'border-b border-border/50'}`
  return onClick
    ? <button type="button" className={`${className} hover:bg-muted/40`} onClick={onClick}>{content}</button>
    : <div className={className}>{content}</div>
}

/**
 * Settings › 空间与服务: the only place with detailed status. Everywhere else
 * stays quiet until something needs the person.
 */
export function SpaceServicesSection() {
  const { session } = useSession()
  const space = useSpaceStatus()
  const navigate = useNavigate()
  const selectSection = useSettingsStore((state) => state.selectSection)
  const secretarySettling = useLinxDefaultSecretaryBootstrapSettling()
  const shell = getRuntimeShellInfo()
  const isDesktop = shell.id === 'desktop'
  const localOnboarding = useLocalOnboarding()
  const localState = localOnboarding.snapshot?.state

  const webId = session.info.webId ?? ''
  const aiValue = space.aiStatus === 'connected'
    ? `已连接 ${space.connectedProviderCount} 个`
    : space.aiStatus === 'not-connected'
      ? '未连接'
      : space.aiStatus === 'unknown' ? '暂时读不到' : '正在确认…'

  return (
    <div className="space-y-6">
      <Group title="账号">
        <Row label="登录方式" value={space.issuerLabel ?? '账号'} />
        <Row label="账号" value={<span title={webId}>{shortAccount(webId)}</span>} />
        <Row label="登录状态" value={session.info.isLoggedIn ? '正常' : '已退出'} last />
      </Group>

      <Group title="空间">
        <Row label="数据保存在" value={<span title={space.providerHost ?? undefined}>{space.spaceLabel}</span>} />
        <Row label="可以保存" value={space.online ? canSaveLabel(space.databaseStatus) : '没有网络，恢复后保存'} last={!isDesktop} />
        {isDesktop ? (
          <Row
            label="外部访问"
            value={localOnboarding.snapshot?.publicUrl ? '已开启' : '未开启'}
            onClick={() => selectSection('network')}
            last
          />
        ) : null}
      </Group>

      <Group title="AI">
        <Row
          label="模型连接"
          value={aiValue}
          onClick={() => void navigate({ to: '/$microAppId', params: { microAppId: 'model-services' } })}
        />
        <Row label="LinX 助手" value={secretarySettling ? '正在准备…' : '已准备'} last />
      </Group>

      {isDesktop ? (
        <Group title="本机服务">
          <Row
            label="运行状态"
            value={localState === 'ready' ? '运行中' : localOnboarding.loading ? '正在确认…' : '没有运行'}
            onClick={() => selectSection('runtime')}
            last
          />
        </Group>
      ) : null}
    </div>
  )
}
