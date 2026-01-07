import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { IssuerPickerProps, SolidIssuerOption } from './types'
import { normalizeIssuerUrl } from './utils'

export function IssuerPicker({
  issuers,
  selectedIssuer,
  customIssuer,
  onSelectIssuer,
  onCustomIssuerChange,
  onSaveCustomIssuer,
}: IssuerPickerProps) {
  const [open, setOpen] = useState(false)
  const [showCustomEntry, setShowCustomEntry] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const normalizedSelected = useMemo(() => (selectedIssuer ? normalizeIssuerUrl(selectedIssuer) : undefined), [selectedIssuer])
  const current = useMemo(
    () =>
      issuers.find((issuer) => normalizeIssuerUrl(issuer.url) === normalizedSelected) ?? issuers[0],
    [issuers, normalizedSelected],
  )

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setShowCustomEntry(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleSelect = (url: string) => {
    onSelectIssuer(url)
    setOpen(false)
    setShowCustomEntry(false)
  }

  const handleCustomSave = () => {
    onSaveCustomIssuer()
    if (!customIssuer.error) {
      setShowCustomEntry(false)
      setOpen(false)
    }
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        className="flex h-10 w-full max-w-[240px] items-center justify-between rounded-xs border border-border/60 bg-card/80 px-3 text-left text-sm"
        onClick={() => setOpen((prev) => !prev)}
      >
        <IssuerRow issuer={current} compact />
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute left-0 z-30 mt-2 w-full max-w-[240px] rounded-sm border border-border/60 bg-card p-2 shadow-xl">
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {issuers.map((issuer) => (
              <button
                key={issuer.id}
                type="button"
                onClick={() => handleSelect(issuer.url)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xs px-3 py-2 text-left text-sm transition',
                  normalizeIssuerUrl(issuer.url) === normalizedSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                )}
              >
                <IssuerRow issuer={issuer}>
                  {issuer.isRecent ? (
                    <span className="rounded-[8px] bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                      最近
                    </span>
                  ) : null}
                </IssuerRow>
              </button>
            ))}
          </div>
          <div className="mt-2 border-t border-border/40 pt-2">
            {showCustomEntry ? (
              <div className="space-y-2">
                <Input
                  value={customIssuer.value}
                  onChange={(event) => onCustomIssuerChange(event.target.value)}
                  placeholder="https://your-pod.example"
                  className={cn('h-8 text-xs', customIssuer.error ? 'border-destructive text-destructive' : '')}
                />
                {customIssuer.error ? (
                  <p className="text-[11px] text-destructive">{customIssuer.error}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">仅需主域名，将自动保存</p>
                )}
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setShowCustomEntry(false)}>
                    取消
                  </Button>
                  <Button size="sm" className="h-7 px-3 text-[11px]" onClick={handleCustomSave} disabled={!customIssuer.isValid}>
                    添加
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full text-[11px]"
                onClick={() => setShowCustomEntry(true)}
              >
                <Plus className="mr-1 h-3 w-3" /> 添加自定义 Issuer
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

const IssuerRow = ({
  issuer,
  compact = false,
  children,
}: {
  issuer: SolidIssuerOption | undefined
  compact?: boolean
  children?: ReactNode
}) => {
  if (!issuer) return null
  return (
    <div className={cn('flex flex-1 items-center gap-2', compact ? 'pr-1' : '')}>
      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-sm bg-muted">
        {issuer.logoUrl ? (
          <img src={issuer.logoUrl} alt={issuer.domain} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[10px] font-semibold text-primary">{issuer.domain.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className={cn('flex flex-1 items-center', children && !compact ? 'justify-between gap-2' : '')}>
        <span className="truncate text-sm font-medium leading-tight text-foreground">
          {issuer.label ?? issuer.domain}
        </span>
        {!compact && children ? <div className="flex items-center gap-1 text-xs text-muted-foreground">{children}</div> : null}
      </div>
      {compact && children}
    </div>
  )
}
