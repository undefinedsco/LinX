import { Fragment } from 'react'
import { Bot, HardDrive, Info, MonitorCog, Palette, RefreshCcw, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  SETTINGS_GROUP_LABELS,
  type SettingsSectionIcon,
  type SettingsSectionId,
  type SettingsSectionItem,
} from '../domain/section-model'

const icons: Record<SettingsSectionIcon, typeof Palette> = {
  space: HardDrive,
  palette: Palette,
  models: Bot,
  runtime: MonitorCog,
  network: Wifi,
  updates: RefreshCcw,
  about: Info,
}

export interface SettingsNavigationProps {
  items: readonly SettingsSectionItem[]
  selectedId: SettingsSectionId
  onSelect: (section: SettingsSectionId) => void
  /** Small status text or marker shown on the right of a row (运行中, 新版本 …). */
  trailing?: Partial<Record<SettingsSectionId, string>>
}

export function SettingsNavigation({ items, selectedId, onSelect, trailing }: SettingsNavigationProps) {
  return (
    <nav aria-label="设置分类" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {items.map((item, index) => {
        const Icon = icons[item.icon]
        const selected = selectedId === item.id
        const startsGroup = index === 0 || items[index - 1].group !== item.group
        const groupLabel = SETTINGS_GROUP_LABELS[item.group]
        return (
          <Fragment key={item.id}>
            {startsGroup && index > 0 ? <div role="separator" className="mx-2 my-1.5 h-px bg-border/60" /> : null}
            {startsGroup && groupLabel ? (
              <div className="px-3 pb-0.5 pt-1 text-xs text-muted-foreground">{groupLabel}</div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              aria-current={selected ? 'page' : undefined}
              data-selected={selected}
              className={cn(
                'h-10 justify-start gap-3 rounded-lg px-3 text-left',
                selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50',
              )}
              onClick={() => onSelect(item.id)}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
              {trailing?.[item.id] ? (
                <span className="shrink-0 text-xs font-normal text-muted-foreground">{trailing[item.id]}</span>
              ) : null}
            </Button>
          </Fragment>
        )
      })}
    </nav>
  )
}
