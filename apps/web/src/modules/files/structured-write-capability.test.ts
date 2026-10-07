import { describe, expect, it } from 'vitest'

import { supportsStructuredWriteProposals } from './domain/structured/structured-write-capability'

describe('structured write capability', () => {
  it('allows editable Turtle resources under .data that are not reserved system resources', () => {
    expect(supportsStructuredWriteProposals({
      uri: 'https://pod.example/.data/workspaces/ws-1/cards/card.ttl',
      mimeType: 'text/turtle',
    })).toBe(true)

    expect(supportsStructuredWriteProposals({
      uri: 'https://pod.example/.data/workspaces/ws-1/cards/card.ttl',
      mimeType: null,
    })).toBe(true)
  })

  it('allows ordinary private Turtle resources outside .data to stage proposals', () => {
    expect(supportsStructuredWriteProposals({
      uri: 'https://pod.example/symphony-test.ttl',
      mimeType: 'text/turtle',
    })).toBe(true)

    expect(supportsStructuredWriteProposals({
      uri: 'https://pod.example/settings/credentials.ttl',
      mimeType: 'text/turtle',
    })).toBe(true)
  })

  it('keeps public, vocab, reserved .data resources, sidecars, and non-Turtle files read-only', () => {
    expect(supportsStructuredWriteProposals({
      uri: 'https://pod.example/.vocab/personal/terms.ttl',
      mimeType: 'text/turtle',
    })).toBe(false)

    expect(supportsStructuredWriteProposals({
      uri: 'https://pod.example/public/profile.ttl',
      mimeType: 'text/turtle',
    })).toBe(false)

    expect(supportsStructuredWriteProposals({
      uri: 'https://pod.example/symphony-test.ttl.meta',
      mimeType: 'text/turtle',
    })).toBe(false)

    expect(supportsStructuredWriteProposals({
      uri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
      mimeType: 'text/turtle',
    })).toBe(false)

    expect(supportsStructuredWriteProposals({
      uri: 'https://pod.example/.data/workspaces/ws-1/cards/card.md',
      mimeType: 'text/markdown',
    })).toBe(false)
  })
})
