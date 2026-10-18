import { useMemo, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { requestSwitchAccount } from '@/modules/login/login-utils'
import { profileInitial, useAuthenticatedAvatar } from '@/modules/profile/avatar'
import { readProfile } from '@/modules/profile/collections'
import { accountHandle } from '@/modules/profile/domain/account-handle'
import { profileDisplayName, readProfileValues } from '@/modules/profile/domain/profile-fields'
import type { SpaceAttentionAction } from '@/modules/profile/domain/space-status'
import { useSpaceStatus } from '@/modules/profile/useSpaceStatus'
import { useSettingsStore } from '@/modules/settings/app/store'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type { MicroAppId, MicroAppPaneProps } from './micro-app-registry'
import { useShellStore } from './shell-store'

function Group({ children }: { children: ReactNode }) {
  return (
    <div className="mx-3 overflow-hidden rounded-[10px] bg-card [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-border">
      {children}
    </div>
  )
}

function Row({ label, onClick, tone }: { label: string; onClick: () => void; tone?: 'plain' | 'center' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={tone === 'center'
        ? 'flex min-h-12 w-full items-center justify-center px-3.5 text-[15px] hover:bg-layout-list-hover'
        : 'flex min-h-12 w-full items-center gap-3 px-3.5 text-left text-[15px] hover:bg-layout-list-hover'}
    >
      <span className={tone === 'center' ? undefined : 'flex-1'}>{label}</span>
      {tone === 'center' ? null : <ChevronRight className="h-4 w-4 text-muted-foreground/70" aria-hidden="true" />}
    </button>
  )
}

/**
 * S5b 我 (narrow windows, like WeChat's phone tab): who you are, then 收藏 and
 * 设置, then account actions. A problem adds one row with one action.
 */
export function MePage(_props: MicroAppPaneProps) {
  const navigate = useNavigate()
  const { session } = useSession()
  const { db } = useSolidDatabase()
  const webId = session.info.webId || ''
  const space = useSpaceStatus()
  const selectSettingsSection = useSettingsStore((state) => state.selectSection)
  const showSettingsList = useSettingsStore((state) => state.showSectionList)
  const setSignOutOpen = useShellStore((state) => state.setSignOutOpen)
  const { data: profile } = useQuery({
    queryKey: ['profile', webId],
    queryFn: async () => (db && webId ? await readProfile(db, webId) : null),
    enabled: !!db && !!webId,
  })
  const values = useMemo(() => readProfileValues(profile as Record<string, unknown> | null | undefined), [profile])
  const name = profileDisplayName(values)
  const { previewUrl, failed, markFailed } = useAuthenticatedAvatar(values.avatar, session.fetch)

  const go = (id: MicroAppId) => void navigate({ to: '/$microAppId', params: { microAppId: id } })
  // Plain 设置 opens the section list; a problem row jumps straight to its section.
  const openSettings = (section?: 'space' | 'runtime') => {
    if (section) selectSettingsSection(section)
    else showSettingsList()
    go('settings')
  }
  const attentionActions: Record<SpaceAttentionAction, () => void> = {
    'open-space-settings': () => openSettings('space'),
    'open-local-service': () => openSettings('runtime'),
    'connect-ai': () => go('model-services'),
  }
  const attention = space.attention

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-layout-list-item pb-6">
      <button
        type="button"
        onClick={() => go('profile')}
        className="flex items-center gap-3.5 bg-card px-5 py-5 text-left hover:bg-layout-list-hover"
      >
        <Avatar className="h-[52px] w-[52px] rounded-lg">
          {previewUrl && !failed ? <AvatarImage src={previewUrl} alt={name} className="object-cover" onError={markFailed} /> : null}
          <AvatarFallback className="!rounded-lg bg-accent text-xl font-semibold text-foreground">{profileInitial(name)}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[17px] font-semibold">{name}</span>
          <span className="truncate text-[13px] text-muted-foreground">{accountHandle(webId)}</span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
      </button>

      <div className="mt-3 space-y-3">
        <Group>
          <Row label="收藏" onClick={() => go('favorites')} />
        </Group>
        <Group>
          <Row label="设置" onClick={() => openSettings()} />
        </Group>
        <Group>
          <Row label="切换账号" tone="center" onClick={requestSwitchAccount} />
          <Row label="退出登录" tone="center" onClick={() => setSignOutOpen(true)} />
        </Group>
        {attention ? (
          <Group>
            <div role="status" className="flex min-h-12 items-center gap-3 px-3.5 text-sm">
              <span className="flex-1">{attention.message}</span>
              {attention.action ? (
                <button
                  type="button"
                  className="shrink-0 font-semibold text-primary hover:underline"
                  onClick={attentionActions[attention.action.id]}
                >
                  {attention.action.label}
                </button>
              ) : null}
            </div>
          </Group>
        ) : null}
      </div>
    </div>
  )
}

export default MePage
