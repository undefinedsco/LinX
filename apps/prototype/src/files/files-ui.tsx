import type { ReactNode } from 'react'
import { FilePlus2, FolderOpen, FolderPlus, Link2, PanelRightClose, PanelRightOpen, ShieldCheck, Upload } from 'lucide-react'
import type { IconType } from './files-types'

export type FolderAddAction = 'new-doc' | 'new-folder' | 'upload-files' | 'upload-folder' | 'add-web'

export const folderAddMenuItems: Array<{ id: FolderAddAction; label: string; icon: IconType; dividerBefore?: boolean }> = [
  { id: 'new-doc', label: '新建文档', icon: FilePlus2 },
  { id: 'new-folder', label: '新建文件夹', icon: FolderPlus },
  { id: 'upload-files', label: '上传文件', icon: Upload, dividerBefore: true },
  { id: 'upload-folder', label: '上传文件夹', icon: FolderOpen },
  { id: 'add-web', label: '添加网页', icon: Link2, dividerBefore: true },
]

export function FolderAddMenu({
  path,
  className = '',
  onPick,
}: {
  path: string
  className?: string
  onPick: (action: FolderAddAction) => void
}) {
  return (
    <div className={`add-menu ${className}`} role="menu" aria-label="新建或上传">
      <small>添加到 {path}</small>
      {folderAddMenuItems.map((item) => {
        const Icon = item.icon
        return (
          <button
            role="menuitem"
            className={item.dividerBefore ? 'divider-before' : ''}
            key={item.id}
            onClick={() => onPick(item.id)}
          >
            <Icon size={15} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ViewTabs({
  ariaLabel,
  views,
  active,
  onChange,
  trailing,
}: {
  ariaLabel: string
  views: Array<{ id: string; label: string; icon: IconType }>
  active: string
  onChange: (id: string) => void
  trailing?: ReactNode
}) {
  return (
    <div className="structured-tabs" aria-label={ariaLabel}>
      {views.map((view) => {
        const Icon = view.icon
        return (
          <button className={active === view.id ? 'active' : ''} key={view.id} onClick={() => onChange(view.id)} title={view.label}>
            <Icon size={15} />
            <span>{view.label}</span>
          </button>
        )
      })}
      {trailing}
    </div>
  )
}

export function FilePageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="file-title">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  )
}

export function FilePageHeader({
  actionClassName = 'file-commandbar',
  actionLabel,
  children,
  subtitle,
  title,
}: {
  actionClassName?: string
  actionLabel?: string
  children: ReactNode
  subtitle?: string
  title: string
}) {
  return (
    <header className="work-header files-header">
      <FilePageTitle title={title} subtitle={subtitle} />
      <div className={`file-actions ${actionClassName}`} aria-label={actionLabel}>
        {children}
      </div>
    </header>
  )
}

export function AccessIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button title="Access" onClick={onClick}>
      <ShieldCheck size={15} />
    </button>
  )
}

export function MetaToggleButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button title={open ? 'Hide .meta' : 'Show .meta'} onClick={onToggle}>
      {open ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
    </button>
  )
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
