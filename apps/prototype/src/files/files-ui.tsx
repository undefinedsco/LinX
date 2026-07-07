import type { ReactNode } from 'react'
import { PanelRightClose, PanelRightOpen, ShieldCheck } from 'lucide-react'

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
