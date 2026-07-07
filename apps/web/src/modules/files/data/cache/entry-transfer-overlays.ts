import type { FilesEntry, FilesResourceTransferInput } from '../../domain/resource/resource-model'

export type ConfirmedEntryTransferOperation = 'copy' | 'move'

export type ConfirmedEntryTransferOverlayContext = {
  includeAll?: boolean
  containerUri?: string | null
}

type ConfirmedEntryTransferOverlay = {
  sourceUri: string
  destinationUri: string
  operation: ConfirmedEntryTransferOperation
  entry: FilesEntry
}

export type ConfirmedEntryTransferOverlayStore = {
  clear: () => void
  forget: (resourceUri: string) => void
  remember: (
    resource: FilesEntry,
    input: FilesResourceTransferInput,
    operation: ConfirmedEntryTransferOperation,
  ) => void
  merge: (
    entries: FilesEntry[],
    context?: ConfirmedEntryTransferOverlayContext,
  ) => FilesEntry[]
}

function shouldIncludeConfirmedEntryTransferOverlay(
  entries: FilesEntry[],
  overlay: ConfirmedEntryTransferOverlay,
  context: ConfirmedEntryTransferOverlayContext = {},
): boolean {
  if (context.includeAll) return true
  if (context.containerUri) return overlay.entry.parentUri === context.containerUri
  return entries.some((entry) => entry.parentUri === overlay.entry.parentUri)
}

export function createConfirmedEntryTransferOverlayStore(): ConfirmedEntryTransferOverlayStore {
  const overlays = new Map<string, ConfirmedEntryTransferOverlay>()

  function forget(resourceUri: string) {
    for (const [key, overlay] of overlays) {
      if (overlay.sourceUri === resourceUri || overlay.destinationUri === resourceUri) {
        overlays.delete(key)
      }
    }
  }

  return {
    clear() {
      overlays.clear()
    },

    forget,

    remember(
      resource: FilesEntry,
      input: FilesResourceTransferInput,
      operation: ConfirmedEntryTransferOperation,
    ) {
      if (operation === 'move') {
        forget(input.sourceUri)
      }
      overlays.set(input.destinationUri, {
        sourceUri: input.sourceUri,
        destinationUri: input.destinationUri,
        operation,
        entry: resource,
      })
    },

    merge(
      entries: FilesEntry[],
      context: ConfirmedEntryTransferOverlayContext = {},
    ): FilesEntry[] {
      if (overlays.size === 0) return entries

      let next = entries
      let changed = false

      for (const [key, overlay] of overlays) {
        const hasSource = next.some((entry) => entry.uri === overlay.sourceUri)
        const hasDestination = next.some((entry) => entry.uri === overlay.destinationUri)

        if (overlay.operation === 'move') {
          if (hasDestination && !hasSource) {
            overlays.delete(key)
            continue
          }
          if (!hasSource) {
            if (shouldIncludeConfirmedEntryTransferOverlay(next, overlay, context)) {
              next = [...next, overlay.entry]
              changed = true
            }
            continue
          }

          const withoutSource = next.filter((entry) => entry.uri !== overlay.sourceUri)
          next = hasDestination
            ? withoutSource
            : [...withoutSource, overlay.entry]
          changed = true
          continue
        }

        if (hasDestination) {
          overlays.delete(key)
          continue
        }

        if (!shouldIncludeConfirmedEntryTransferOverlay(next, overlay, context)) {
          continue
        }

        next = [...next, overlay.entry]
        changed = true
      }

      return changed ? next : entries
    },
  }
}
