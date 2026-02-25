import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Moon, Sun, Upload, Settings, Bot, Info, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  microAppRegistry,
  MicroAppId,
  ThemeMode,
  type MicroAppLayoutConfig,
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
import { ServiceManagementDialog } from '@/modules/settings/ServiceManagementDialog'

interface PrimaryLayoutProps {
  microAppId: MicroAppId
  onNavigate?: (id: MicroAppId) => void
}

const primaryNavIds: MicroAppId[] = ['chat', 'contacts', 'files', 'favorites']
const secondaryNavIds: MicroAppId[] = []

const bottomUtilities = [
  { id: 'import', icon: Upload, label: '导入', action: 'import' },
  { id: 'settings', icon: Settings, label: '设置', action: 'settings' }, // 'settings' now triggers popover
] as const

type UtilityAction = (typeof bottomUtilities)[number]['action']

const useThemeMode = (): [ThemeMode, () => void] => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark'
    const saved = localStorage.getItem('linx-theme') as ThemeMode | null
    if (saved) return saved
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    return prefersDark ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('linx-theme', theme)
  }, [theme])

  const toggle = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))

  return [theme, toggle]
}

// Inner component that is safe to use varying hooks because it's keyed
function MicroAppContentRenderer({ 
  microAppId, 
  theme, 
  onToggleTheme,
  rightPaneWidth: forcedRightWidth 
}: { 
  microAppId: MicroAppId
  theme: ThemeMode
  onToggleTheme: () => void
  rightPaneWidth?: number
}) {
  const activeMicroApp = microAppRegistry[microAppId]
  const ListPane = activeMicroApp.ListPane
  const ContentPane = activeMicroApp.ContentPane
  
  // Safely call variable hooks here because this component re-mounts on ID change
  const useLayoutConfigHook = activeMicroApp.useLayoutConfig ?? (() => undefined as MicroAppLayoutConfig | undefined)
  const layoutConfig = useLayoutConfigHook()

  const rightSidebarWidth = layoutConfig?.rightSidebar ? layoutConfig.rightSidebarWidth ?? 320 : 0

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full w-full">
      <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
        <section className="flex h-full flex-col border-r border-border/40 bg-layout-list-item">
          <ListPane theme={theme} />
        </section>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={80}>
        <section className="h-full flex bg-layout-content">
          <div className="flex-1 flex flex-col min-h-0">
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
              <ContentPane theme={theme} />
            </div>
          </div>
          {layoutConfig?.rightSidebar && (
            <aside
              className="hidden xl:flex flex-col border-l border-border/50 bg-card/40"
              style={{ width: rightSidebarWidth, minWidth: rightSidebarWidth }}
            >
              {layoutConfig.rightSidebar}
            </aside>
          )}
        </section>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

// ... (imports)

// ... (interfaces)

// ... (bottomUtilities definition)

// ... (useThemeMode)

// ... (MicroAppContentRenderer)

function SettingsMenu({ 
  onNavigate, 
  onOpenServiceManagement 
}: { 
  onNavigate: (id: MicroAppId) => void
  onOpenServiceManagement: () => void 
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
        <DropdownMenuItem onSelect={onOpenServiceManagement} className="cursor-pointer text-violet-500 focus:text-violet-500">
          <Activity className="mr-2 h-4 w-4" strokeWidth={1.5} />
          <span>服务管理</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => console.log('About clicked')} className="cursor-pointer">
          <Info className="mr-2 h-4 w-4" strokeWidth={1.5} />
          <span>关于</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PrimaryLayout({ microAppId, onNavigate }: PrimaryLayoutProps) {
  const navigate = useNavigate()
  const [theme, toggleTheme] = useThemeMode()
  const [isServiceMgmtOpen, setIsServiceMgmtOpen] = useState(false)

  const primaryApps = useMemo(() => primaryNavIds.map((id) => microAppRegistry[id]), [])
  const secondaryApps = useMemo(() => secondaryNavIds.map((id) => microAppRegistry[id]), [])

  const handleNavigate = (id: MicroAppId) => {
    navigate({ to: '/$microAppId', params: { microAppId: id } })
    onNavigate?.(id)
  }

  const handleUtilityClick = (action: UtilityAction) => {
    // This will now only handle 'import' if needed, 'settings' is handled by Popover
    if (action === 'import') {
      alert('Import hub coming soon')
      return
    }
  }

  const sidebarWidth = linxLayout.sidebar.defaultWidth // This is the leftmost App Nav width

  return (
    <div className="h-screen w-screen bg-background text-foreground overflow-hidden">
      <div className="flex h-full w-full">
        {/* Leftmost Fixed Application Navigation Sidebar */}
        <aside
          className="flex h-full flex-col bg-layout-sidebar border-r border-border/50"
          style={{ width: sidebarWidth }}
        >
          {/* Sidebar avatar area - 56px from top to avatar's top edge */}
          <div className="pt-[56px] flex justify-center">
            <Popover>
              <PopoverTrigger asChild>
                <Avatar className="w-9 h-9 !rounded-md shadow-sm cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all">
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold !rounded-md">
                    L
                  </AvatarFallback>
                </Avatar>
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
              return (
                <Button
                  key={app.id}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "w-9 h-9 rounded-md transition-all duration-200",
                    isActive 
                      ? "text-primary hover:bg-transparent hover:text-primary" 
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                  onClick={() => handleNavigate(app.id)}
                  aria-label={app.label}
                >
                  <Icon 
                    size={24} 
                    strokeWidth={isActive ? 2 : 1.5} 
                    fill={isActive ? "currentColor" : "none"}
                    className="transition-all"
                  />
                </Button>
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
            {/* Settings Popover and Utilities */} 
            {bottomUtilities.map((utility) => {
              if (utility.id === 'settings') {
                return (
                  <SettingsMenu 
                    key={utility.id} 
                    onNavigate={handleNavigate} 
                    onOpenServiceManagement={() => setIsServiceMgmtOpen(true)}
                  />
                )
              }
              const Icon = utility.icon
              return (
                <Button
                  key={utility.id}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "w-9 h-9 rounded-md hover:bg-transparent",
                    "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => handleUtilityClick(utility.action)}
                  aria-label={utility.label}
                >
                  <Icon 
                    size={24} 
                    strokeWidth={1.5}
                  />
                </Button>
              )
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
    </div>
  )
}
