import type { ReactNode } from 'react'

export function LoginCardShell({
  children,
  overlayClassName,
  cardClassName,
  cardSize = 'compact',
}: {
  children: ReactNode
  overlayClassName?: string
  cardClassName?: string
  cardSize?: 'compact' | 'auto'
}) {
  const baseCardClassName = cardSize === 'auto'
    ? 'w-compact-modal overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_12px_32px_rgba(0,0,0,0.10)] flex flex-col'
    : 'w-compact-modal h-compact-modal overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_12px_32px_rgba(0,0,0,0.10)] flex flex-col'

  return (
    <div className={['fixed inset-0 z-[999] flex items-center justify-center bg-black/50', overlayClassName]
      .filter(Boolean)
      .join(' ')}
    >
      <div
        data-login-card-size={cardSize}
        className={[baseCardClassName, cardClassName]
        .filter(Boolean)
        .join(' ')}
      >
        {children}
      </div>
    </div>
  )
}
