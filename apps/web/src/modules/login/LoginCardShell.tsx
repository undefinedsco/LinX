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
    ? 'w-compact-modal overflow-hidden rounded-xl border border-border/50 bg-card flex flex-col'
    : 'w-compact-modal h-compact-modal overflow-hidden rounded-xl border border-border/50 bg-card flex flex-col'

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
