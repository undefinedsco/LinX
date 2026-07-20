import { Image as ImageIcon } from 'lucide-react'
import type { ImageMessageBlock } from '../message-blocks'
import { safeImageUrl } from './safe-url'

export function ImageBlock({ block }: { block: ImageMessageBlock }) {
  const source = safeImageUrl(block.url || block.filePath)
  if (!source) return null

  return (
    <figure className="my-2 overflow-hidden rounded-xl border border-border/60 bg-muted/20">
      <img
        src={source}
        alt="消息图片"
        className="max-h-[28rem] w-auto max-w-full object-contain"
        loading="lazy"
      />
      <figcaption className="flex items-center gap-2 border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        图片附件
      </figcaption>
    </figure>
  )
}
