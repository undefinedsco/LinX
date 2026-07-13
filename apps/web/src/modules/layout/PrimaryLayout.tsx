import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import linxLogoUrl from '@/assets/linx-logo.png'
import { Moon, Sun, Settings, Bot, Info, Activity, LogOut, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  microAppRegistry,
  MicroAppId,
  ThemeMode,
  type MicroAppLayoutConfig,
  type MicroAppNavigationIntent,
} from './micro-app-registry'
import { linxLayout } from '@/theme/spacing'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SelfProfileCard } from '@/modules/profile/SelfProfileCard'
import { InboxBellButton } from '@/modules/inbox/components/InboxBellButton'
import { ServiceManagementDialog } from '@/modules/settings/features/service/ServiceManagementDialog'
import { requestSignOut } from '@/modules/login/login-utils'
import { useSession } from '@/providers/solid-session-provider'
import { AboutDialog } from './AboutDialog'
import { useAppUpdateStatus } from './use-app-update-status'
import { useThemeMode } from './use-theme-mode'
import { OPEN_SERVICE_MANAGEMENT_EVENT } from '@/modules/settings/app/events'

interface PrimaryLayoutProps {
  microAppId: MicroAppId
  onNavigate?: (id: MicroAppId, intent: MicroAppNavigationIntent) => void
}

export function getMainPanelDefaultSize(isCompactViewport: boolean): '100%' | '80%' {
  return isCompactViewport ? '100%' : '80%'
}

/**
 * First releasable desktop slice:
 * keep visible navigation limited to stable day-one modules.
 * Experimental surfaces stay routeable for internal work, but are hidden from
 * the main sidebar until they reach a releasable quality bar.
 */
const primaryNavIds: MicroAppId[] = ['chat', 'contacts', 'files', 'favorites']
const secondaryNavIds: MicroAppId[] = []

function PaneFallback() {
  return <div className="h-full w-full animate-pulse bg-muted/10" />
}

const compactViewportQuery = '(max-width: 767px)'

function readCompactViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(compactViewportQuery).matches
}

function useCompactViewport() {
  const [isCompactViewport, setIsCompactViewport] = useState(readCompactViewport)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const query = window.matchMedia(compactViewportQuery)
    const updateViewport = () => setIsCompactViewport(query.matches)
    updateViewport()
    query.addEventListener('change', updateViewport)
    return () => query.removeEventListener('change', updateViewport)
  }, [])

  return isCompactViewport
}

// Inner component that is safe to use varying hooks because it's keyed
function MicroAppContentRenderer({
  microAppId,
  theme,
  onToggleTheme,
  isCompactViewport,
  compactNavigation,
}: {
  microAppId: MicroAppId
  theme: ThemeMode
  onToggleTheme: () => void
  isCompactViewport: boolean
  compactNavigation?: React.ReactNode
}) {
  const activeMicroApp = microAppRegistry[microAppId]
  const ListPane = activeMicroApp.ListPane
  const ContentPane = activeMicroApp.ContentPane
  const LayoutConfigBridge = activeMicroApp.LayoutConfigBridge
  const [layoutConfig, setLayoutConfig] = useState<MicroAppLayoutConfig | undefined>(undefined)
  const handleLayoutConfigChange = useCallback(
    (nextConfig: MicroAppLayoutConfig | undefined) => {
      setLayoutConfig(nextConfig)
    },
    [],
  )

  const rightSidebarWidth = layoutConfig?.rightSidebar ? layoutConfig.rightSidebarWidth ?? 320 : 0
  const listPanelWidth = linxLayout.listPanel.defaultWidth
  const listPanelMinWidth = linxLayout.listPanel.minWidth
  const listPanelMaxWidth = linxLayout.listPanel.maxWidth

  return (
    <>
      {LayoutConfigBridge ? (
        <Suspense fallback={null}>
          <LayoutConfigBridge onConfigChange={handleLayoutConfigChange} />
        </Suspense>
      ) : null}
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        {!isCompactViewport ? (
          <>
            <ResizablePanel
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
                className="flex h-full min-w-0 flex-col overflow-hidden border-r border-border/40 bg-layout-list-item"
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

        <ResizablePanel defaultSize={getMainPanelDefaultSize(isCompactViewport)} className="min-w-0 overflow-hidden">
          <section className="h-full flex bg-layout-content">
            <div className="flex-1 flex flex-col min-h-0">
              {!layoutConfig?.hideHeader && !(isCompactViewport && activeMicroApp.hideContentHeaderOnCompact) && (
                <div data-testid="micro-app-content-head" className="h-12 flex items-center border-b border-border bg-layout-content">
                  {layoutConfig?.header ? (
                    <div className="flex-1 h-full">
                      {layoutConfig.header}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-[100px] px-4">
                        {!layoutConfig?.hideIcon && (
                          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                            <activeMicroApp.icon className="w-3.5 h-3.5 text-primary" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 text-center">
                        <h3 className="text-sm font-medium truncate">{layoutConfig?.mainTitle ?? activeMicroApp.header.moduleTitle}</h3>
                      </div>

                      <div className="flex items-center gap-1 min-w-[100px] justify-end px-4">
                        {layoutConfig?.topActions}
                        <InboxBellButton />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={onToggleTheme}
                          title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
                        >
                          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="flex-1 min-h-0 flex flex-col">
                <Suspense fallback={<PaneFallback />}>
                  <ContentPane theme={theme} compact={isCompactViewport} compactNavigation={compactNavigation} />
                </Suspense>
              </div>
            </div>
            {layoutConfig?.rightSidebar && (
              <aside
                className="hidden xl:flex flex-col border-l border-border/50 bg-card/40"
                style={{ width: rightSidebarWidth, minWidth: rightSidebarWidth }}
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
}

function SettingsMenu({
  onNavigate,
  onOpenServiceManagement,
  onOpenAbout,
  onSignOut,
  aboutLabel,
}: {
  onNavigate: (id: MicroAppId) => void
  onOpenServiceManagement: () => void
  onOpenAbout: () => void
  onSignOut: () => void
  aboutLabel: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="w-9 h-9 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground"
          aria-label="设置"
        >
          <Settings className="w-6 h-6" strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48" align="start" side="right" sideOffset={10}>
        <DropdownMenuLabel>设置</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onNavigate('settings')} className="cursor-pointer">
          <Settings className="mr-2 h-4 w-4" strokeWidth={1.5} />
          <span>通用设置</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onNavigate('model-services')} className="cursor-pointer">
          <Bot className="mr-2 h-4 w-4" strokeWidth={1.5} />
          <span>模型服务</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenServiceManagement} className="cursor-pointer text-boundary focus:text-boundary">
          <Activity className="mr-2 h-4 w-4" strokeWidth={1.5} />
          <span>服务管理</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenAbout} className="cursor-pointer">
          <Info className="mr-2 h-4 w-4" strokeWidth={1.5} />
          <span>{aboutLabel}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" strokeWidth={1.5} />
          <span>退出登录</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PrimaryLayout({ microAppId, onNavigate }: PrimaryLayoutProps) {
  const navigate = useNavigate()
  const { session, sessionRequestInProgress } = useSession()
  const [theme, toggleTheme] = useThemeMode()
  const isCompactViewport = useCompactViewport()
  const [isServiceMgmtOpen, setIsServiceMgmtOpen] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const appUpdate = useAppUpdateStatus()
  const isWorkspaceReady = session.info.isLoggedIn && !sessionRequestInProgress

  const primaryApps = useMemo(() => primaryNavIds.map((id) => microAppRegistry[id]), [])
  const secondaryApps = useMemo(() => secondaryNavIds.map((id) => microAppRegistry[id]), [])
  const aboutLabel = appUpdate.status.available ? '关于（有更新）' : '关于'

  const handleSignOut = useCallback(() => {
    requestSignOut()
  }, [])

  const handleNavigate = (id: MicroAppId) => {
    onNavigate?.(id, 'default')
    navigate({ to: '/$microAppId', params: { microAppId: id } })
  }

  const sidebarWidth = linxLayout.sidebar.defaultWidth // This is the leftmost App Nav width
  const hidePrimaryRail = Boolean(microAppRegistry[microAppId].hidePrimaryRailOnCompact && isCompactViewport)
  const compactNavigation = isCompactViewport ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="切换模块"
          title="切换模块"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {primaryApps.map((app) => {
          const Icon = app.icon
          return (
            <DropdownMenuItem
              key={app.id}
              disabled={app.id === microAppId}
              onSelect={() => handleNavigate(app.id)}
            >
              <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
              {app.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : undefined

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

  return (
    <div className="h-screen w-screen bg-background text-foreground overflow-hidden" data-micro-app-id={microAppId}>
      <div className="flex h-full w-full">
        {/* Leftmost Fixed Application Navigation Sidebar */}
        {!hidePrimaryRail ? (
          <aside
            className="flex h-full flex-col bg-layout-sidebar border-r border-border/50"
            style={{ width: sidebarWidth }}
          >
          {/* Sidebar avatar area - 56px from top to avatar's top edge */}
          <div data-testid="primary-profile-avatar-slot" className="pt-[48px] flex flex-col items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="个人资料"
                  className="w-9 h-9 rounded-md shadow-sm cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all overflow-hidden"
                >
                  <Avatar className="w-full h-full !rounded-md">
                    <AvatarImage src={linxLogoUrl} alt="LinX" className="object-cover" />
                    <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold !rounded-md">
                      L
                    </AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" sideOffset={12} className="p-0 border-none shadow-xl bg-card">
                <SelfProfileCard />
              </PopoverContent>
            </Popover>
          </div>
          <nav className="flex-1 py-4 flex flex-col items-center gap-4">
            {primaryApps.map((app) => {
              const Icon = app.icon
              const isActive = app.id === microAppId
              const navLabel = app.label
              return (
                <div key={app.id} className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "w-9 h-9 rounded-md transition-all duration-200",
                      isActive
                        ? "text-primary hover:bg-transparent hover:text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                    onClick={() => handleNavigate(app.id)}
                    aria-label={navLabel}
                    title={navLabel}
                  >
                    <Icon
                      size={24}
                      strokeWidth={isActive ? 2 : 1.5}
                      fill={isActive ? "currentColor" : "none"}
                      className="transition-all"
                    />
                  </Button>
                </div>
              )
            })}
          </nav>
          <Separator className="bg-border/30 w-8 mx-auto" />
          <div className="py-4 flex flex-col items-center gap-4 w-full">
            {secondaryApps.map((app) => {
              const Icon = app.icon
              const isActive = app.id === microAppId
              return (
                <Button
                  key={app.id}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "w-9 h-9 rounded-md hover:bg-transparent",
                    isActive
                      ? "text-primary hover:text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => handleNavigate(app.id)}
                  aria-label={app.label}
                >
                  <Icon
                    size={24}
                    strokeWidth={isActive ? 2 : 1.5}
                    fill={isActive ? "currentColor" : "none"}
                  />
                </Button>
              )
            })}
            <SettingsMenu
              onNavigate={handleNavigate}
              onOpenServiceManagement={() => setIsServiceMgmtOpen(true)}
              onOpenAbout={() => setIsAboutOpen(true)}
              onSignOut={handleSignOut}
              aboutLabel={aboutLabel}
            />
          </div>
          </aside>
        ) : null}

        {/* Resizable MicroApp Content Area */}
        <div className="flex-1 min-w-0">
          <MicroAppContentRenderer
            key={microAppId}
            microAppId={microAppId}
            theme={theme}
            onToggleTheme={toggleTheme}
            isCompactViewport={isCompactViewport}
            compactNavigation={compactNavigation}
          />
        </div>
      </div>

      <ServiceManagementDialog
        open={isServiceMgmtOpen}
        onOpenChange={setIsServiceMgmtOpen}
      />
      <AboutDialog
        open={isAboutOpen}
        onOpenChange={setIsAboutOpen}
        status={appUpdate.status}
        isChecking={appUpdate.isChecking}
        onCheckUpdates={() => {
          void appUpdate.refresh(true, 'manual')
        }}
        onOpenReleasePage={() => {
          void appUpdate.openReleasePage()
        }}
      />
    </div>
  )
}
