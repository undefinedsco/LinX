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
    ? 'w-compact-modal warm-card overflow-hidden rounded-xl flex flex-col'
    : 'w-compact-modal h-compact-modal warm-card overflow-hidden rounded-xl flex flex-col'

  return (
    <div className={['fixed inset-0 z-[999] flex items-center justify-center bg-black/50', overlayClassName]
      .filter(Boolean)
      .join(' ')}
    >
      <div className={[baseCardClassName, cardClassName]
        .filter(Boolean)
        .join(' ')}
      >
        {children}
      </div>
    </div>
  )
}
