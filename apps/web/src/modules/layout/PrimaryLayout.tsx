import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import {
  microAppRegistry,
  MicroAppId,
  ThemeMode,
  type MicroAppLayoutConfig,
  type MicroAppNavigationIntent,
} from './micro-app-registry'
import { linxLayout } from '@/theme/spacing'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useDefaultLayout } from 'react-resizable-panels'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SelfProfileCard } from '@/modules/profile/SelfProfileCard'
import { SelfAvatar } from '@/modules/profile/SelfAvatar'
import { useSpaceStatus } from '@/modules/profile/useSpaceStatus'
import { useSettingsStore, type SettingsSectionId } from '@/modules/settings/store'
import { InboxRailButton } from '@/modules/inbox/components/InboxRailButton'
import { ServiceManagementDialog } from '@/modules/settings/features/service/ServiceManagementDialog'
import { AgentMethodDialogHost } from '@/modules/my-ai/features/AgentMethodDialog'
import { requestSignOut, requestSwitchAccount } from '@/modules/login/login-utils'
import { useSession } from '@/providers/solid-session-provider'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { useAppUpdateStatus } from './use-app-update-status'
import { useThemeMode } from './use-theme-mode'
import { OPEN_SERVICE_MANAGEMENT_EVENT } from '@/modules/settings/app/events'
import { SettingsMenu } from './SettingsMenu'
import { SignOutDialog } from './SignOutDialog'
import { CompactTabBar } from './CompactTabBar'
import { railNavButtonClassName } from './rail-style'
import { useShellStore } from './shell-store'

interface PrimaryLayoutProps {
  microAppId: MicroAppId
  onNavigate?: (id: MicroAppId, intent: MicroAppNavigationIntent) => void
}

export function getMainPanelDefaultSize(isCompactViewport: boolean): '100%' | '80%' {
  return isCompactViewport ? '100%' : '80%'
}

/**
 * S0 rail: 聊天 / 联系人 / 文件 / 收藏 above, 收件箱 / 设置 below, icons only.
 * 我的 AI is out of this round; working methods open in a dialog instead.
 */
const primaryNavIds: MicroAppId[] = ['chat', 'contacts', 'files', 'favorites']

function PaneFallback() {
  return <div className="h-full w-full animate-pulse bg-muted/10" />
}

/**
 * Width tiers (S5–S5d). Below 700 the window shows one level at a time with a
 * bottom bar; below 1280 the right pane floats over the content; at tablet
 * widths the left pane narrows to 240 so the content keeps ~460.
 */
export const compactViewportQuery = '(max-width: 699px)'
export const narrowListViewportQuery = '(max-width: 1023px)'
export const wideViewportQuery = '(min-width: 1280px)'
export const NARROW_LIST_PANEL_WIDTH = 240

function readMediaQuery(query: string, fallback: boolean) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return fallback
  }
  return window.matchMedia(query).matches
}

function useMediaQuery(query: string, fallback = false) {
  const [matches, setMatches] = useState(() => readMediaQuery(query, fallback))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}

// Inner component that is safe to use varying hooks because it's keyed
function MicroAppContentRenderer({
  microAppId,
  theme,
  isCompactViewport,
  isNarrowList,
  isWideViewport,
  compactHeadActions,
  listPanelHidden = false,
}: {
  microAppId: MicroAppId
  theme: ThemeMode
  isCompactViewport: boolean
  isNarrowList: boolean
  isWideViewport: boolean
  compactHeadActions?: ReactNode
  listPanelHidden?: boolean
}) {
  const activeMicroApp = microAppRegistry[microAppId]
  const ListPane = activeMicroApp.ListPane
  const ContentPane = activeMicroApp.ContentPane
  const LayoutConfigBridge = activeMicroApp.LayoutConfigBridge
  // Xpod AI Connections is workspace infrastructure, not page-local state.
  // Keep its controller mounted for every micro-app so chat/contact consumers
  // read the same public model catalog as the model-services screen.
  const Provider = activeMicroApp.Provider
  const [layoutConfig, setLayoutConfig] = useState<MicroAppLayoutConfig | undefined>(undefined)
  const handleLayoutConfigChange = useCallback(
    (nextConfig: MicroAppLayoutConfig | undefined) => {
      setLayoutConfig(nextConfig)
    },
    [],
  )

  const showListPane = Boolean(ListPane) && !isCompactViewport && !listPanelHidden
  const rightSidebarWidth = layoutConfig?.rightSidebar ? layoutConfig.rightSidebarWidth ?? 320 : 0
  const configuredListMaxWidth = layoutConfig?.listPanel?.maxWidth ?? linxLayout.listPanel.maxWidth
  const listPanelMaxWidth = isNarrowList ? Math.min(configuredListMaxWidth, NARROW_LIST_PANEL_WIDTH) : configuredListMaxWidth
  const listPanelWidth = Math.min(layoutConfig?.listPanel?.defaultWidth ?? linxLayout.listPanel.defaultWidth, listPanelMaxWidth)
  // S5d: at medium widths the left pane is a fixed 240 so its header controls fit.
  const listPanelMinWidth = isNarrowList
    ? listPanelMaxWidth
    : Math.min(layoutConfig?.listPanel?.minWidth ?? linxLayout.listPanel.minWidth, listPanelMaxWidth)
  const tier = isCompactViewport ? 'compact' : isNarrowList ? 'medium' : 'desktop'
  const panelIds = showListPane ? ['list', 'main'] : ['main']
  const persistedLayout = useDefaultLayout({
    id: `linx-primary-layout-${microAppId}-${tier}`,
    panelIds,
  })
  const hideHeader = Boolean(layoutConfig?.hideHeader)
    || Boolean(activeMicroApp.hideContentHeader)
    || (isCompactViewport && Boolean(activeMicroApp.hideContentHeaderOnCompact))
  const rightSidebarToggle = layoutConfig?.rightSidebarToggle
  // Below 1280 the open right pane floats over the content: Esc or a click
  // outside closes it.
  const rightSidebarFloating = Boolean(layoutConfig?.rightSidebar) && !isWideViewport
  const closeFloatingSidebar = rightSidebarFloating && rightSidebarToggle?.open ? rightSidebarToggle.onToggle : undefined

  useEffect(() => {
    if (!closeFloatingSidebar) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) closeFloatingSidebar()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeFloatingSidebar])

  const content = (
    <>
      {LayoutConfigBridge ? (
        <Suspense fallback={null}>
          <LayoutConfigBridge onConfigChange={handleLayoutConfigChange} />
        </Suspense>
      ) : null}
      <ResizablePanelGroup
        direction="horizontal"
        id={`linx-primary-layout-${microAppId}`}
        defaultLayout={persistedLayout.defaultLayout}
        onLayoutChanged={persistedLayout.onLayoutChanged}
        className="h-full w-full"
      >
        {showListPane && ListPane ? (
          <>
            <ResizablePanel
              id="list"
              defaultSize={listPanelWidth}
              minSize={listPanelMinWidth}
              maxSize={listPanelMaxWidth}
              className="min-w-0 shrink-0 overflow-hidden"
              style={{
                minWidth: listPanelMinWidth,
                width: listPanelWidth,
                maxWidth: listPanelMaxWidth,
              }}
            >
              <section
                className="flex h-full min-w-0 flex-col overflow-hidden bg-layout-list-item"
                data-testid="micro-app-list-panel"
                style={{
                  minWidth: listPanelMinWidth,
                  width: '100%',
                  maxWidth: listPanelMaxWidth,
                }}
              >
                <Suspense fallback={<PaneFallback />}>
                  <ListPane theme={theme} />
                </Suspense>
              </section>
            </ResizablePanel>

            <ResizableHandle withHandle />
          </>
        ) : null}

        <ResizablePanel id="main" defaultSize={getMainPanelDefaultSize(isCompactViewport)} className="min-w-0 overflow-hidden">
          <section className="relative h-full flex bg-layout-content">
            <div className="flex-1 flex flex-col min-h-0">
              {!hideHeader && (
                <div data-testid="micro-app-content-head" className="h-12 flex items-center border-b border-border bg-layout-content">
                  <div className="flex h-full min-w-0 flex-1 items-center">
                    {layoutConfig?.header ? layoutConfig.header : (
                      <div className="min-w-0 px-4 text-left" data-micro-app-title-slot="true">
                        <h3 className="text-sm font-medium truncate" data-default-micro-app-title="true">
                          {layoutConfig?.mainTitle ?? activeMicroApp.header.moduleTitle}
                        </h3>
                      </div>
                    )}
                  </div>
                  <div className="flex h-full shrink-0 items-center gap-1 px-4">
                    {layoutConfig?.topActions}
                    {isCompactViewport ? compactHeadActions : null}
                    {rightSidebarToggle ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`${rightSidebarToggle.open ? '收起' : '展开'}${rightSidebarToggle.label ?? '右侧面板'}`}
                        title={`${rightSidebarToggle.open ? '收起' : '展开'}${rightSidebarToggle.label ?? '右侧面板'}`}
                        aria-expanded={rightSidebarToggle.open}
                        onClick={rightSidebarToggle.onToggle}
                      >
                        {rightSidebarToggle.open ? (
                          <PanelRightClose className="w-4 h-4" />
                        ) : (
                          <PanelRightOpen className="w-4 h-4" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
              <div className="flex-1 min-h-0 flex flex-col">
                <Suspense fallback={<PaneFallback />}>
                  <ContentPane theme={theme} compact={isCompactViewport} />
                </Suspense>
              </div>
            </div>
            {closeFloatingSidebar ? (
              <button
                type="button"
                aria-label={`关闭${rightSidebarToggle?.label ?? '右侧面板'}`}
                tabIndex={-1}
                data-testid="micro-app-right-sidebar-backdrop"
                className="absolute inset-0 z-10 cursor-default bg-transparent"
                onClick={closeFloatingSidebar}
              />
            ) : null}
            {layoutConfig?.rightSidebar && (
              // Wide windows dock the right sidebar; narrower ones float it over
              // the content so its toggle always does something visible.
              <aside
                data-testid="micro-app-right-sidebar"
                data-floating={rightSidebarFloating ? 'true' : undefined}
                className="absolute inset-y-0 right-0 z-20 flex max-w-full flex-col border-l border-border/50 bg-card shadow-xl xl:static xl:z-auto xl:bg-card/40 xl:shadow-none"
                style={{ width: rightSidebarWidth, minWidth: Math.min(rightSidebarWidth, 280) }}
              >
                <Suspense fallback={<PaneFallback />}>
                  {layoutConfig.rightSidebar}
                </Suspense>
              </aside>
            )}
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  )

  return Provider ? (
    <Suspense fallback={<PaneFallback />}>
      <Provider>{content}</Provider>
    </Suspense>
  ) : content
}

export function PrimaryLayout({ microAppId, onNavigate }: PrimaryLayoutProps) {
  const navigate = useNavigate()
  const { session, sessionRequestInProgress } = useSession()
  const { scopeKey: databaseScopeKey } = useSolidDatabase()
  const isSignOutOpen = useShellStore((state) => state.signOutOpen)
  const setIsSignOutOpen = useShellStore((state) => state.setSignOutOpen)
  const [theme] = useThemeMode()
  const isCompactViewport = useMediaQuery(compactViewportQuery)
  const isNarrowList = useMediaQuery(narrowListViewportQuery)
  const isWideViewport = useMediaQuery(wideViewportQuery, true)
  const [isServiceMgmtOpen, setIsServiceMgmtOpen] = useState(false)
  const [listPanelHidden, setListPanelHidden] = useState(false)
  useEffect(() => {
    setListPanelHidden(false)
  }, [microAppId])
  const appUpdate = useAppUpdateStatus()
  const isWorkspaceReady = session.info.isLoggedIn && !sessionRequestInProgress

  const primaryApps = useMemo(() => primaryNavIds.map((id) => microAppRegistry[id]), [])
  const space = useSpaceStatus()
  const spaceLabel = `${space.spaceLabel}空间`
  // The rail only speaks up when something needs attention; a healthy space
  // shows no badge and no "connected" claim.
  const spaceAttention = space.attention
  const profileTriggerLabel = spaceAttention
    ? `个人资料，${spaceLabel}，${spaceAttention.message}`
    : `个人资料，${spaceLabel}`
  const selectSettingsSection = useSettingsStore((state) => state.selectSection)
  const [isProfileCardOpen, setIsProfileCardOpen] = useState(false)

  const handleSignOut = useCallback(() => {
    setIsSignOutOpen(true)
  }, [setIsSignOutOpen])

  const handleNavigate = (id: MicroAppId) => {
    if (id === microAppId && !isCompactViewport && microAppRegistry[id].ListPane) {
      setListPanelHidden((current) => !current)
      return
    }
    onNavigate?.(id, 'default')
    navigate({ to: '/$microAppId', params: { microAppId: id } })
  }

  const openSettings = (section: SettingsSectionId) => {
    selectSettingsSection(section)
    if (microAppId === 'settings') return
    onNavigate?.('settings', 'default')
    navigate({ to: '/$microAppId', params: { microAppId: 'settings' } })
  }

  const sidebarWidth = linxLayout.sidebar.defaultWidth // This is the leftmost App Nav width

  useEffect(() => {
    const handleOpenServiceManagement = () => {
      setIsServiceMgmtOpen(true)
    }

    window.addEventListener(OPEN_SERVICE_MANAGEMENT_EVENT, handleOpenServiceManagement)
    return () => {
      window.removeEventListener(OPEN_SERVICE_MANAGEMENT_EVENT, handleOpenServiceManagement)
    }
  }, [])

  if (!isWorkspaceReady) {
    return <div className="h-screen w-screen bg-background" />
  }

  const closeCardThen = (action: () => void) => () => {
    setIsProfileCardOpen(false)
    action()
  }

  return (
    <div className="h-screen w-screen bg-background text-foreground overflow-hidden" data-micro-app-id={microAppId}>
      <div className={isCompactViewport ? 'flex h-full w-full flex-col' : 'flex h-full w-full'}>
        {/* Leftmost Fixed Application Navigation Sidebar */}
        {!isCompactViewport ? (
          <aside
            className="flex h-full flex-col bg-layout-sidebar border-r border-border/50"
            style={{ width: sidebarWidth }}
          >
          {/* WeChat-style rail: the person's own avatar sits at the very top. */}
          <div data-testid="primary-profile-avatar-slot" className="pt-4 flex flex-col items-center">
            <Popover open={isProfileCardOpen} onOpenChange={setIsProfileCardOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={profileTriggerLabel}
                  title={spaceLabel}
                  className="relative w-9 h-9 rounded-md cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all"
                >
                  <SelfAvatar className="w-full h-full" />
                  {spaceAttention ? (
                    <span
                      data-testid="primary-space-attention"
                      data-severity={spaceAttention.severity}
                      aria-hidden="true"
                      className={spaceAttention.severity === 'action'
                        ? 'absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold leading-none text-primary-foreground'
                        : 'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-background bg-muted-foreground'}
                    >
                      {spaceAttention.severity === 'action' ? '!' : null}
                    </span>
                  ) : null}
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" sideOffset={12} className="w-auto border-none bg-transparent p-0 shadow-xl">
                <SelfProfileCard
                  onEditProfile={closeCardThen(() => handleNavigate('profile'))}
                  onOpenSettings={closeCardThen(() => openSettings('space'))}
                  onOpenLocalService={closeCardThen(() => openSettings('runtime'))}
                  onConnectAi={closeCardThen(() => handleNavigate('model-services'))}
                  onSwitchAccount={closeCardThen(requestSwitchAccount)}
                  onSignOut={closeCardThen(handleSignOut)}
                />
              </PopoverContent>
            </Popover>
          </div>
          <nav aria-label="主导航" className="flex-1 py-5 flex flex-col items-center gap-3">
            {primaryApps.map((app) => {
              const Icon = app.icon
              const isActive = app.id === microAppId
              return (
                <Button
                  key={app.id}
                  variant="ghost"
                  size="icon"
                  className={railNavButtonClassName(isActive)}
                  onClick={() => handleNavigate(app.id)}
                  aria-label={app.label}
                  aria-current={isActive ? 'page' : undefined}
                  title={app.label}
                >
                  <Icon size={22} strokeWidth={isActive ? 2 : 1.5} aria-hidden="true" />
                </Button>
              )
            })}
          </nav>
          <Separator className="bg-border/30 w-8 mx-auto" />
          <div className="py-4 flex flex-col items-center gap-3 w-full">
            <InboxRailButton
              active={microAppId === 'inbox'}
              onOpen={() => handleNavigate('inbox')}
              className={railNavButtonClassName(microAppId === 'inbox')}
            />
            <SettingsMenu
              className={`relative ${railNavButtonClassName(microAppId === 'settings')}`}
              onOpenSettings={() => openSettings('general')}
              onOpenAbout={() => openSettings('about')}
              onSignOut={handleSignOut}
              updateAvailable={appUpdate.status.available}
            />
          </div>
          </aside>
        ) : null}

        {/* Resizable MicroApp Content Area */}
        <div className="flex-1 min-w-0 min-h-0">
          <MicroAppContentRenderer
            key={microAppId}
            microAppId={microAppId}
            theme={theme}
            isCompactViewport={isCompactViewport}
            isNarrowList={isNarrowList}
            isWideViewport={isWideViewport}
            compactHeadActions={(
              <InboxRailButton
                active={microAppId === 'inbox'}
                onOpen={() => handleNavigate('inbox')}
                className={railNavButtonClassName(microAppId === 'inbox')}
              />
            )}
            listPanelHidden={listPanelHidden}
          />
        </div>
        {isCompactViewport ? (
          <CompactTabBar activeId={microAppId} onNavigate={handleNavigate} />
        ) : null}
      </div>

      <ServiceManagementDialog
        open={isServiceMgmtOpen}
        onOpenChange={setIsServiceMgmtOpen}
      />
      <SignOutDialog
        open={isSignOutOpen}
        onOpenChange={setIsSignOutOpen}
        accountScope={databaseScopeKey}
        onConfirm={requestSignOut}
      />
      <AgentMethodDialogHost />
    </div>
  )
}
