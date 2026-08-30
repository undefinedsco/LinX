import { Square } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ChatGenerationControl({ active, onStop }: {
  active: boolean
  onStop: () => void
}) {
  if (!active) return null

  return (
    <div className="pointer-events-none absolute bottom-5 right-7 z-40 rounded-full bg-background p-1">
      <Button
        type="button"
        size="icon"
        className="pointer-events-auto size-10 rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90 hover:text-background"
        aria-label="停止生成"
        onClick={onStop}
      >
        <Square className="size-3 fill-current" />
        <span className="sr-only">停止生成</span>
      </Button>
    </div>
  )
}
