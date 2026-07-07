import { describe, expect, it } from 'vitest'
import { createConfirmedEntryTransferOverlayStore } from './entry-transfer-overlays'
import type { FilesEntry } from './browser'

function fileEntry(uri: string, parentUri = 'https://pod.example/public/'): FilesEntry {
  return {
    id: uri,
    uri,
    name: uri.endsWith('/report-renamed.md') ? 'report-renamed.md' : 'report.md',
    kind: 'resource',
    semanticKind: 'file',
    parentUri,
    mimeType: 'text/markdown',
    size: 8,
    modifiedAt: null,
  }
}

describe('confirmed entry transfer overlays', () => {
  it('replaces a stale moved source with the confirmed destination', () => {
    const overlays = createConfirmedEntryTransferOverlayStore()
    const source = fileEntry('https://pod.example/public/report.md')
    const destination = fileEntry('https://pod.example/public/report-renamed.md')

    overlays.remember(destination, {
      sourceUri: source.uri,
      destinationUri: destination.uri,
    }, 'move')

    expect(overlays.merge([source], { includeAll: true })).toEqual([destination])
  })

  it('injects a confirmed destination only when the active scope can contain it', () => {
    const overlays = createConfirmedEntryTransferOverlayStore()
    const source = fileEntry('https://pod.example/public/report.md')
    const destination = fileEntry(
      'https://pod.example/public/archive/report.md',
      'https://pod.example/public/archive/',
    )

    overlays.remember(destination, {
      sourceUri: source.uri,
      destinationUri: destination.uri,
    }, 'move')

    expect(overlays.merge([], { containerUri: 'https://pod.example/public/' })).toEqual([])
    expect(overlays.merge([], { containerUri: 'https://pod.example/public/archive/' })).toEqual([
      destination,
    ])
  })

  it('expires copy overlays after the Pod list already includes the destination', () => {
    const overlays = createConfirmedEntryTransferOverlayStore()
    const source = fileEntry('https://pod.example/public/report.md')
    const destination = fileEntry('https://pod.example/public/report-copy.md')

    overlays.remember(destination, {
      sourceUri: source.uri,
      destinationUri: destination.uri,
    }, 'copy')

    const confirmedEntries = [source, destination]
    expect(overlays.merge(confirmedEntries, { includeAll: true })).toBe(confirmedEntries)
    expect(overlays.merge([source], { includeAll: true })).toEqual([source])
  })

  it('forgets overlays that mention a deleted source or destination', () => {
    const overlays = createConfirmedEntryTransferOverlayStore()
    const source = fileEntry('https://pod.example/public/report.md')
    const destination = fileEntry('https://pod.example/public/report-renamed.md')

    overlays.remember(destination, {
      sourceUri: source.uri,
      destinationUri: destination.uri,
    }, 'move')
    overlays.forget(source.uri)

    expect(overlays.merge([source], { includeAll: true })).toEqual([source])
  })
})
