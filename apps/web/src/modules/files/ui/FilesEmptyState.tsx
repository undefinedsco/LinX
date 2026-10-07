import type { ComponentType, ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'

interface FilesEmptyStateIconProps {
  className?: string
}

export interface FilesEmptyStateProps {
  title: string
  description: string
  icon?: ComponentType<FilesEmptyStateIconProps>
  action?: ReactNode
}

export function FilesEmptyState({
  title,
  description,
  icon: Icon = FolderOpen,
  action,
}: FilesEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16">
      <Icon className="w-12 h-12 text-muted-foreground/30" />
      <p className="text-sm">{title}</p>
      <p className="text-xs text-muted-foreground/60 text-center max-w-[260px]">{description}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
