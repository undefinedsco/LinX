import { Info, LogOut, Menu, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface SettingsMenuProps {
  onOpenSettings: () => void
  onOpenAbout: () => void
  onSignOut: () => void
  /** Marks the menu when a new version is waiting. */
  updateAvailable?: boolean
  className?: string
}

/**
 * Bottom of the rail (S0): 设置与更多, like WeChat's ≡. Operational detail
 * (local service, external access, keys) lives in Settings, not here.
 */
export function SettingsMenu({
  onOpenSettings,
  onOpenAbout,
  onSignOut,
  updateAvailable = false,
  className,
}: SettingsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className ?? 'relative h-9 w-9 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground'}
          aria-label={updateAvailable ? '设置与更多，有新版本' : '设置与更多'}
          title="设置"
        >
          <Menu size={22} strokeWidth={1.5} aria-hidden="true" />
          {updateAvailable ? (
            <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44" align="end" side="right" sideOffset={10}>
        <DropdownMenuItem onSelect={onOpenSettings} className="cursor-pointer">
          <Settings className="mr-2 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          <span>设置</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenAbout} className="cursor-pointer">
          <Info className="mr-2 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          <span>{updateAvailable ? '关于 LinX（有新版本）' : '关于 LinX'}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          <span>退出登录</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
