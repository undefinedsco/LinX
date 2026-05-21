import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildAccountManagementUrl,
  derivePodSlugFromWebId,
  detectStorageConflict,
  resolveExpectedStorageUrl,
} from './storage-reconciliation'

describe('storage-reconciliation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('derives the pod slug from a Cloud WebID', () => {
    expect(derivePodSlugFromWebId('https://id.undefineds.co/alice/profile/card#me')).toBe('alice')
  })

  it('resolves the expected storage URL from the current provider public URL', () => {
    expect(
      resolveExpectedStorageUrl(
        'https://id.undefineds.co/alice/profile/card#me',
        'https://node-abc123.undefineds.co/',
      ),
    ).toBe('https://node-abc123.undefineds.co/alice/')
  })

  it('builds the current-space management URL', () => {
    expect(buildAccountManagementUrl('http://localhost:5737')).toBe('http://localhost:5737/.account/account/')
  })

  it('returns null when profile storage already matches the current provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/alice/profile/card#me',
        'solid:storage': { '@id': 'https://node-abc123.undefineds.co/alice/' },
      }),
    }))

    await expect(
      detectStorageConflict({
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        providerUrl: 'http://localhost:5737',
        providerPublicUrl: 'https://node-abc123.undefineds.co/',
      }),
    ).resolves.toBeNull()
  })

  it('returns a conflict when profile storage points at another provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/turtle' }),
      text: async () => `
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        <https://id.undefineds.co/alice/profile/card#me>
          solid:storage <https://node-old999.undefineds.co/alice/> .
      `,
    }))

    await expect(
      detectStorageConflict({
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        providerUrl: 'http://localhost:5737',
        providerPublicUrl: 'https://node-abc123.undefineds.co/',
      }),
    ).resolves.toEqual({
      expectedStorageUrl: 'https://node-abc123.undefineds.co/alice/',
      actualStorageUrl: 'https://node-old999.undefineds.co/alice/',
      providerUrl: 'http://localhost:5737',
      managementUrl: 'http://localhost:5737/.account/account/',
    })
  })

  it('does not block a Cloud+Local login while Cloud profile still points at Cloud storage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/alice/profile/card#me',
        'solid:storage': { '@id': 'https://id.undefineds.co/alice/' },
      }),
    }))

    await expect(
      detectStorageConflict({
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        providerUrl: 'http://localhost:5737',
        providerPublicUrl: 'https://node-abc123.undefineds.co/',
      }),
    ).resolves.toBeNull()
  })

  it('treats profiles without solid:storage as non-blocking for now', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/alice/profile/card#me',
        'solid:oidcIssuer': { '@id': 'https://id.undefineds.co' },
      }),
    }))

    await expect(
      detectStorageConflict({
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        providerUrl: 'http://localhost:5737',
        providerPublicUrl: 'https://node-abc123.undefineds.co/',
      }),
    ).resolves.toBeNull()
  })
})
