import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Star } from 'lucide-react'
import type { IconType } from '../files/files-types'

export function useDismissable(open: boolean, onClose: () => void, insideSelector?: string) {
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    if (!insideSelector) {
      return () => window.removeEventListener('keydown', closeOnEscape)
    }
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(insideSelector)) return
      onClose()
    }
    window.addEventListener('mousedown', closeOnOutside)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('mousedown', closeOnOutside)
    }
  }, [open, onClose, insideSelector])
}

export function usePopover(insideSelector: string) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  useDismissable(open, close, insideSelector)
  return {
    open,
    close,
    toggle: () => setOpen((current) => !current),
  }
}

export interface MenuItem {
  label: string
  icon: IconType
  kbd?: string
  destructive?: boolean
  dividerBefore?: boolean
  run: () => void
}

export function Menu({
  items,
  label,
  onClose,
}: {
  items: MenuItem[]
  label: string
  onClose: () => void
}) {
  return (
    <div className="row-menu" role="menu" aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            role="menuitem"
            className={`${item.destructive ? 'destructive' : ''} ${item.dividerBefore ? 'divider-before' : ''}`}
            key={item.label}
            onClick={() => {
              onClose()
              item.run()
            }}
          >
            <Icon size={14} />
            <span>{item.label}</span>
            {item.kbd ? <kbd>{item.kbd}</kbd> : null}
          </button>
        )
      })}
    </div>
  )
}

export function ConfirmSheet({
  title,
  description,
  confirmLabel,
  destructive = false,
  error,
  input,
  onCancel,
  onConfirm,
}: {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  error?: string
  input?: {
    ariaLabel: string
    value: string
    onChange: (value: string) => void
  }
  onCancel: () => void
  onConfirm: () => void
}) {
  useDismissable(true, onCancel)
  return (
    <div className="op-sheet-layer">
      <div className="op-sheet" role="dialog" aria-label={title}>
        <h4>{title}</h4>
        <p>{description}</p>
        {input ? (
          <input
            autoFocus
            value={input.value}
            aria-label={input.ariaLabel}
            onChange={(event) => input.onChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onConfirm()
              if (event.key === 'Escape') onCancel()
            }}
          />
        ) : null}
        {error ? <span className="op-error">{error}</span> : null}
        <div className="op-actions">
          <button onClick={onCancel} autoFocus>取消</button>
          <button className={destructive ? 'danger' : 'primary'} disabled={Boolean(error)} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function InfoRow({ icon: Icon, label, value, link }: { icon: IconType; label: string; value: string; link?: boolean }) {
  return (
    <div className="file-info-row">
      <span><Icon size={12} /> {label}</span>
      <strong className={link ? 'file-info-link' : undefined}>{value}</strong>
    </div>
  )
}

export function InfoPanel({
  badge,
  children,
  title = 'Info',
}: {
  badge?: string
  children: React.ReactNode
  title?: string
}) {
  const [hidden, setHidden] = useState(false)
  return (
    <section className="file-info-panel" aria-label={title}>
      <header className="file-info-head">
        <span>{title}</span>
        <span className="file-info-head-side">
          {badge ? <small>{badge}</small> : null}
          <button onClick={() => setHidden((current) => !current)}>{hidden ? 'Show' : 'Hide'}</button>
        </span>
      </header>
      {hidden ? null : <div className="file-info-body">{children}</div>}
    </section>
  )
}

export function RowActions({
  favorited,
  menuOpen,
  onToggleFavorite,
  onToggleMenu,
}: {
  favorited: boolean
  menuOpen: boolean
  onToggleFavorite: () => void
  onToggleMenu: () => void
}) {
  return (
    <span className="row-actions">
      <span
        role="button"
        aria-label={favorited ? '取消收藏' : '收藏'}
        title={favorited ? '取消收藏' : '收藏'}
        className={`row-action ${favorited ? 'favorited' : ''}`}
        onClick={(event) => {
          event.stopPropagation()
          onToggleFavorite()
        }}
      >
        <Star size={13} />
      </span>
      <span
        role="button"
        aria-label="更多"
        title="更多"
        className="row-action"
        aria-expanded={menuOpen}
        onClick={(event) => {
          event.stopPropagation()
          onToggleMenu()
        }}
      >
        <MoreHorizontal size={14} />
      </span>
    </span>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  hint,
}: {
  icon: IconType
  title: string
  description?: string
  action?: React.ReactNode
  hint?: string
}) {
  return (
    <div className="empty-state">
      <Icon size={26} />
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action}
      {hint ? <p className="empty-state-hint">{hint}</p> : null}
    </div>
  )
}
