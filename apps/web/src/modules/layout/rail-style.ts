import { cn } from '@/lib/utils'

/**
 * Icon-only rail entries (WeChat-style). The active entry carries a surface
 * and an ink outline so selection never depends on colour alone.
 */
export function railNavButtonClassName(isActive: boolean): string {
  return cn(
    'h-9 w-9 rounded-md transition-all duration-200',
    isActive
      ? 'bg-background text-primary ring-1 ring-inset ring-primary/60 hover:bg-background hover:text-primary'
      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
  )
}
