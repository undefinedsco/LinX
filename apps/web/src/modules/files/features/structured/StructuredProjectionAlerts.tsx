import { Info } from 'lucide-react'

import {
  projectStructuredProjectionWarningsAlert,
  projectStructuredShapeWarningsAlert,
  projectStructuredSourceUnavailableAlert,
} from './structured-projection-alerts-model'

export function StructuredSourceUnavailableAlert({ compact = false }: { compact?: boolean }) {
  const alert = projectStructuredSourceUnavailableAlert({ compact })

  return (
    <div className={alert.compact
      ? 'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive'
      : 'mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive'}
    >
      {alert.message}
    </div>
  )
}

export function StructuredShapeWarningsAlert({
  warnings,
}: {
  warnings: readonly { message: string }[]
}) {
  const alert = projectStructuredShapeWarningsAlert(warnings)
  if (!alert.available) return null

  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800">
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="font-medium">
        {alert.countLabel}
      </span>
      <span className="min-w-0 truncate text-[11px]">{alert.message}</span>
    </div>
  )
}

export function StructuredProjectionWarningsAlert({
  warnings,
}: {
  warnings: readonly string[]
}) {
  const alert = projectStructuredProjectionWarningsAlert(warnings)
  if (!alert.available) return null

  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
      {alert.message}
    </div>
  )
}
