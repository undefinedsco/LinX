import { MonitorCog, Palette, RefreshCcw, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SettingsSectionIcon, SettingsSectionId, SettingsSectionItem } from '../domain/section-model'

const icons: Record<SettingsSectionIcon, typeof Palette> = {
  palette: Palette,
  updates: RefreshCcw,
  runtime: MonitorCog,
  network: Wifi,
}

export interface SettingsNavigationProps {
  items: readonly SettingsSectionItem[]
  selectedId: SettingsSectionId
  onSelect: (section: SettingsSectionId) => void
}

export function SettingsNavigation({ items, selectedId, onSelect }: SettingsNavigationProps) {
  return (
    <nav aria-label="设置分类" className="flex flex-1 flex-col gap-1 p-2">
      {items.map((item) => {
        const Icon = icons[item.icon]
        const selected = selectedId === item.id
        return (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            aria-current={selected ? 'page' : undefined}
            data-selected={selected}
            className={cn(
              'h-auto items-start justify-start gap-3 rounded-lg px-3 py-3 text-left',
              selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50',
            )}
            onClick={() => onSelect(item.id)}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
            </span>
          </Button>
        )
      })}
    </nav>
  )
}
