import { Activity, Bot, Info, LogOut, Moon, Settings, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { MicroAppId, ThemeMode } from './micro-app-registry'

interface SettingsMenuProps {
  theme: ThemeMode
  onToggleTheme: () => void
  onNavigate: (id: MicroAppId) => void
  onOpenServiceManagement: () => void
  onOpenAbout: () => void
  onSignOut: () => void
  aboutLabel: string
}

export function SettingsMenu({
  theme,
  onToggleTheme,
  onNavigate,
  onOpenServiceManagement,
  onOpenAbout,
  onSignOut,
  aboutLabel,
}: SettingsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          aria-label="设置"
        >
          <Settings className="h-6 w-6" strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48" align="start" side="right" sideOffset={10}>
        <DropdownMenuLabel>设置</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onNavigate('settings')} className="cursor-pointer">
          <Settings className="mr-2 h-4 w-4" strokeWidth={1.5} />
          <span>通用设置</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggleTheme} className="cursor-pointer">
          {theme === 'dark' ? (
            <Sun className="mr-2 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Moon className="mr-2 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          )}
          <span>{theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}</span>
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
