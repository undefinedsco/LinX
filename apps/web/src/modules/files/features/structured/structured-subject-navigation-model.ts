import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import {
  resolveStructuredSubjectOpenTarget,
  type StructuredSubjectOpenTarget,
} from '../../domain/structured/structured-subject-peek'

export type StructuredSubjectOpenOptions = {
  navigate?: boolean
  rowIndex?: number | null
  scrollTop?: number
}

export type StructuredSubjectAlternativeOpenRequest = {
  subject: string
  targetUri: string
  kind: StructuredSubjectOpenTarget['kind']
  options?: StructuredSubjectOpenOptions
}

export type StructuredScrollRestorationTarget = {
  documentUri: string
  subject: string
  scrollTop: number
  rowIndex?: number | null
} | null | undefined

export function normalizeStructuredSubjectOpenOptions(
  target: StructuredSubjectOpenTarget,
  options?: StructuredSubjectOpenOptions,
): StructuredSubjectOpenOptions | undefined {
  if (!options?.navigate || target.canNavigateDirectly) return options
  return {
    ...options,
    navigate: false,
  }
}

export function projectStructuredAlternativeSubjectOpenRequest({
  documentUri,
  options,
  projection,
  subject,
}: {
  documentUri: string
  subject: string
  projection: StructuredTableProjection
  options?: StructuredSubjectOpenOptions
}): StructuredSubjectAlternativeOpenRequest | null {
  const openTarget = resolveStructuredSubjectOpenTarget(documentUri, subject, {
    fallbackToDocument: true,
    projection,
  })
  if (!openTarget) return null
  return {
    subject,
    targetUri: openTarget.targetUri,
    kind: openTarget.kind,
    options: normalizeStructuredSubjectOpenOptions(openTarget, options),
  }
}

export function projectStructuredScrollRestorationTargetSignature({
  documentUri,
  scrollRestoration,
  tableProjection,
}: {
  documentUri: string
  scrollRestoration: StructuredScrollRestorationTarget
  tableProjection: StructuredTableProjection
}) {
  return scrollRestoration?.documentUri === documentUri
    ? tableProjection.rows.map((row, index) => `${index}:${row.subject}`).join('\u0000')
    : ''
}

export function resolveStructuredSamePodSourceResourceUri(documentUri: string, source: string) {
  try {
    const documentUrl = new URL(documentUri)
    const sourceUrl = new URL(source)
    if (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:') return null
    if (sourceUrl.origin !== documentUrl.origin) return null
    if (sourceUrl.hash) return null
    return sourceUrl.toString()
  } catch {
    return null
  }
}
