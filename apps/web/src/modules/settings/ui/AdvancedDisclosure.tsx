import { useId, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface AdvancedDisclosureProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  label?: string
  className?: string
}

export function AdvancedDisclosure({
  open,
  onOpenChange,
  children,
  label = '高级网络设置',
  className,
}: AdvancedDisclosureProps) {
  const contentId = useId()
  return (
    <div className={cn('space-y-3', className)}>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => onOpenChange(!open)}
      >
        {label}
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </Button>
      {open ? <div id={contentId}>{children}</div> : null}
    </div>
  )
}
