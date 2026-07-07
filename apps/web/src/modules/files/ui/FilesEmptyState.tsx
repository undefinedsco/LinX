import type { ComponentType } from 'react'
import { FolderOpen } from 'lucide-react'

interface FilesEmptyStateIconProps {
  className?: string
}

export interface FilesEmptyStateProps {
  title: string
  description: string
  icon?: ComponentType<FilesEmptyStateIconProps>
}

export function FilesEmptyState({
  title,
  description,
  icon: Icon = FolderOpen,
}: FilesEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16">
      <Icon className="w-12 h-12 text-muted-foreground/30" />
      <p className="text-sm">{title}</p>
      <p className="text-xs text-muted-foreground/60 text-center max-w-[260px]">{description}</p>
    </div>
  )
}
