import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useSettingsStore, type SettingsSectionId } from '../store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MonitorCog, Palette, RefreshCcw, Wifi } from 'lucide-react'

const SECTION_ITEMS: {
  id: SettingsSectionId
  title: string
  description: string
  icon: typeof Palette
}[] = [
  {
    id: 'general',
    title: '通用',
    description: '主题与常用入口',
    icon: Palette,
  },
  {
    id: 'updates',
    title: '版本更新',
    description: '检查新版本与发布页',
    icon: RefreshCcw,
  },
  {
    id: 'runtime',
    title: '运行环境',
    description: '当前壳与本地服务',
    icon: MonitorCog,
  },
  {
    id: 'network',
    title: '本地网络',
    description: '域名、隧道与可达性',
    icon: Wifi,
  },
]

export function SettingsListPane({}: MicroAppPaneProps) {
  const selectedSection = useSettingsStore((state) => state.selectedSection)
  const selectSection = useSettingsStore((state) => state.selectSection)

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <div className="border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">设置</h2>
        <p className="mt-1 text-xs text-muted-foreground">桌面首发面可见的真实配置入口。</p>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        {SECTION_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = selectedSection === item.id
          return (
            <Button
              key={item.id}
              variant="ghost"
              className={cn(
                'h-auto items-start justify-start gap-3 rounded-lg px-3 py-3 text-left',
                isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50',
              )}
              onClick={() => selectSection(item.id)}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">{item.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{item.description}</div>
              </div>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
