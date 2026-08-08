export interface ChatKitAnnotation {
  index: number
  source: {
    type: 'url' | 'file'
    url?: string
    filename?: string
    title?: string
    description?: string
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asSafeCitationUrl(value: unknown): string | undefined {
  const url = asNonEmptyString(value)
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

function asIndex(...values: unknown[]): number | undefined {
  return values.find((value): value is number => Number.isInteger(value) && Number(value) >= 0) as number | undefined
}

/**
 * Converts OpenAI-compatible citation shapes into ChatKit annotations.
 * Providers differ on whether citation fields live directly on the annotation
 * or under `url_citation` / `file_citation`, so the boundary accepts both.
 */
export function normalizeModelAnnotations(
  value: unknown,
  fallbackIndex: number,
): ChatKitAnnotation[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((raw): ChatKitAnnotation[] => {
    const annotation = asRecord(raw)
    if (!annotation) return []

    const source = asRecord(annotation.source)
    const urlCitation = asRecord(annotation.url_citation)
    const fileCitation = asRecord(annotation.file_citation)
    const url = asSafeCitationUrl(source?.url ?? urlCitation?.url ?? annotation.url)
    const filename = asNonEmptyString(source?.filename ?? fileCitation?.filename ?? annotation.filename)
    const index = asIndex(
      annotation.index,
      urlCitation?.end_index,
      annotation.end_index,
      fileCitation?.index,
      fallbackIndex,
    ) ?? fallbackIndex

    if (url) {
      return [{
        index,
        source: {
          type: 'url',
          url,
          title: asNonEmptyString(source?.title ?? urlCitation?.title ?? annotation.title) ?? url,
          description: asNonEmptyString(source?.description ?? urlCitation?.description ?? annotation.description),
        },
      }]
    }

    if (filename) {
      return [{
        index,
        source: {
          type: 'file',
          filename,
          title: asNonEmptyString(source?.title ?? fileCitation?.title ?? annotation.title) ?? filename,
          description: asNonEmptyString(source?.description ?? fileCitation?.description ?? annotation.description),
        },
      }]
    }

    return []
  })
}

export function mergeChatKitAnnotations(
  current: ChatKitAnnotation[],
  incoming: ChatKitAnnotation[],
): ChatKitAnnotation[] {
  const merged = new Map<string, ChatKitAnnotation>()
  for (const annotation of [...current, ...incoming]) {
    const sourceKey = annotation.source.url ?? annotation.source.filename ?? annotation.source.title ?? ''
    merged.set(`${annotation.source.type}:${sourceKey}:${annotation.index}`, annotation)
  }
  return [...merged.values()].sort((left, right) => left.index - right.index)
}
