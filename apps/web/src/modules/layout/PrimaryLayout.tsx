import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import linxLogoUrl from '@/assets/linx-logo.png'
import { Moon, Sun, Settings, Bot, Info, Activity, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  microAppRegistry,
  MicroAppId,
  ThemeMode,
  type MicroAppLayoutConfig,
} from './micro-app-registry'
import { linxLayout } from '@/theme/spacing'
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
import { ServiceManagementDialog } from '@/modules/settings/ServiceManagementDialog'
import { requestSignOut } from '@/modules/login/login-utils'
import { useSession } from '@/providers/solid-session-provider'
import { AboutDialog } from './AboutDialog'
import { useAppUpdateStatus } from './use-app-update-status'
import { useThemeMode } from './use-theme-mode'
import { OPEN_SERVICE_MANAGEMENT_EVENT } from '@/modules/settings/events'

interface PrimaryLayoutProps {
  microAppId: MicroAppId
  onNavigate?: (id: MicroAppId) => void
}

/**
 * First releasable desktop slice:
 * keep visible navigation limited to stable day-one modules.
 * Experimental surfaces stay routeable for internal work, but are hidden from
 * the main sidebar until they reach a releasable quality bar.
 */
const primaryNavIds: MicroAppId[] = ['chat', 'contacts', 'files', 'favorites']
const secondaryNavIds: MicroAppId[] = []

const bottomUtilities = [
  { id: 'settings', icon: Settings, label: '设置', action: 'settings' },
] as const

function PaneFallback() {
  return <div className="h-full w-full animate-pulse bg-muted/10" />
}

// Inner component that is safe to use varying hooks because it's keyed
function MicroAppContentRenderer({ 
  microAppId, 
  theme, 
  onToggleTheme,
}: { 
  microAppId: MicroAppId
  theme: ThemeMode
  onToggleTheme: () => void
}) {
  const activeMicroApp = microAppRegistry[microAppId]
  const ListPane = activeMicroApp.ListPane
  const ContentPane = activeMicroApp.ContentPane
  const LayoutConfigBridge = activeMicroApp.LayoutConfigBridge
  const layoutContainerRef = useRef<HTMLDivElement>(null)
  const [layoutConfig, setLayoutConfig] = useState<MicroAppLayoutConfig | undefined>(undefined)
  const [listPanelWidth, setListPanelWidth] = useState<number>(linxLayout.listPanel.defaultWidth)
  const handleLayoutConfigChange = useCallback(
    (nextConfig: MicroAppLayoutConfig | undefined) => {
      setLayoutConfig(nextConfig)
    },
    [],
  )

  const rightSidebarWidth = layoutConfig?.rightSidebar ? layoutConfig.rightSidebarWidth ?? 320 : 0
  const listPanelMinWidth = linxLayout.listPanel.minWidth
  const listPanelMaxWidth = linxLayout.listPanel.maxWidth
  const contentAreaMinWidth = linxLayout.contentArea.minWidth

  const clampListPanelWidth = useCallback(
    (nextWidth: number) => {
      const containerWidth = layoutContainerRef.current?.getBoundingClientRect().width
      const maxWidthByContent = containerWidth
        ? Math.max(listPanelMinWidth, Math.min(listPanelMaxWidth, containerWidth - contentAreaMinWidth))
        : listPanelMaxWidth
      return Math.min(Math.max(nextWidth, listPanelMinWidth), maxWidthByContent)
    },
    [contentAreaMinWidth, listPanelMaxWidth, listPanelMinWidth],
  )

  const handleListResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = layoutContainerRef.current
      if (!container) return

      event.preventDefault()
      const containerRect = container.getBoundingClientRect()

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setListPanelWidth(clampListPanelWidth(moveEvent.clientX - containerRect.left))
      }

      const handlePointerUp = () => {
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', handlePointerUp)
      }

      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', handlePointerUp, { once: true })
    },
    [clampListPanelWidth],
  )

  return (
    <>
      {LayoutConfigBridge ? (
        <Suspense fallback={null}>
          <LayoutConfigBridge onConfigChange={handleLayoutConfigChange} />
        </Suspense>
      ) : null}
      <div ref={layoutContainerRef} className="flex h-full w-full min-w-0 overflow-hidden">
        <div
          className={cn(
            'shrink-0 overflow-hidden',
            layoutConfig?.mobileContentActive === true && 'max-md:hidden',
          )}
          style={{
            minWidth: listPanelMinWidth,
            width: listPanelWidth,
            maxWidth: listPanelMaxWidth,
          }}
        >
          <section
            className="flex h-full flex-col border-r border-border/40 bg-layout-list-item"
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
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整列表宽度"
          className={cn(
            'group relative z-10 h-full w-1 shrink-0 cursor-col-resize bg-transparent outline-none hover:bg-primary/15 focus-visible:bg-primary/20',
            layoutConfig?.mobileContentActive !== undefined && 'max-md:hidden',
          )}
          onPointerDown={handleListResizePointerDown}
          tabIndex={0}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/50 transition-colors group-hover:bg-primary/50" />
        </div>

        <div className={cn(
          'min-w-0 flex-1 overflow-auto',
          layoutConfig?.mobileContentActive === false && 'max-md:hidden',
        )}>
          <section className="h-full min-w-0 flex bg-layout-content">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {!layoutConfig?.hideHeader && (
                <div className="h-16 flex items-center border-b border-border bg-layout-content">
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
                  <ContentPane theme={theme} />
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
        </div>
      </div>
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
          <span>模型管理</span>
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
    navigate({ to: '/$microAppId', params: { microAppId: id } })
    onNavigate?.(id)
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

  return (
    <div className="h-screen w-screen bg-background text-foreground overflow-hidden">
      <div className="flex h-full w-full">
        {/* Leftmost Fixed Application Navigation Sidebar */}
        <aside
          className="hidden h-full flex-col bg-layout-sidebar border-r border-border/50 md:flex"
          style={{ width: sidebarWidth }}
        >
          {/* Sidebar avatar area - 56px from top to avatar's top edge */}
          <div className="pt-[56px] flex flex-col items-center gap-3">
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
		                        ? "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
	                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
	                    )}
                    onClick={() => handleNavigate(app.id)}
                    aria-label={navLabel}
                    title={navLabel}
                  >
		                    <Icon
		                      size={24}
		                      strokeWidth={isActive ? 2.25 : 1.5}
	                      fill="none"
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
	                    "w-9 h-9 rounded-md",
		                    isActive
		                      ? "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
	                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
	                  )}
                  onClick={() => handleNavigate(app.id)}
                  aria-label={app.label}
                >
		                  <Icon
		                    size={24}
	                    strokeWidth={isActive ? 2.25 : 1.5}
		                    fill="none"
	                  />
                </Button>
              )
            })}
	            {/* Settings Popover and Utilities */}
            {bottomUtilities.map((utility) => {
              if (utility.id === 'settings') {
                return (
                  <SettingsMenu
                    key={utility.id}
                    onNavigate={handleNavigate}
                    onOpenServiceManagement={() => setIsServiceMgmtOpen(true)}
                    onOpenAbout={() => setIsAboutOpen(true)}
                    onSignOut={handleSignOut}
                    aboutLabel={aboutLabel}
                  />
                )
              }
              return null
            })}
          </div>
        </aside>

        {/* Resizable MicroApp Content Area */}
        <div className="flex-1 min-w-0">
          <MicroAppContentRenderer
            key={microAppId}
            microAppId={microAppId}
            theme={theme}
            onToggleTheme={toggleTheme}
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
