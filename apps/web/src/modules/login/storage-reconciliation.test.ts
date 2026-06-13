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
    vi.useRealTimers()
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

  it.each([
    {
      route: 'Cloud account authority + Cloud SP',
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      storageProviderPublicUrl: 'https://id.undefineds.co/',
      expectedStorageUrl: 'https://id.undefineds.co/alice/',
    },
    {
      route: 'Cloud account authority + Local SP',
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      storageProviderPublicUrl: 'https://node-abc123.undefineds.co/',
      expectedStorageUrl: 'https://node-abc123.undefineds.co/alice/',
    },
    {
      route: 'Standalone local account authority + Local SP',
      webId: 'http://localhost:5737/alice/profile/card#me',
      storageProviderPublicUrl: 'http://localhost:5737/',
      expectedStorageUrl: 'http://localhost:5737/alice/',
    },
    {
      route: 'strict same-origin provider',
      webId: 'https://solid.example.net/bob/profile/card#me',
      storageProviderPublicUrl: 'https://solid.example.net/',
      expectedStorageUrl: 'https://solid.example.net/bob/',
    },
  ])('resolves expected storage for $route', ({ webId, storageProviderPublicUrl, expectedStorageUrl }) => {
    expect(resolveExpectedStorageUrl(webId, storageProviderPublicUrl)).toBe(expectedStorageUrl)
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
        storageProviderUrl: 'http://localhost:5737',
        storageProviderPublicUrl: 'https://node-abc123.undefineds.co/',
      }),
    ).resolves.toBeNull()
  })

  it('uses the provided authenticated fetch when the profile is not publicly readable', async () => {
    const anonymousFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => 'unauthorized',
    })
    const authenticatedFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/alice/profile/card#me',
        'solid:storage': { '@id': 'https://id.undefineds.co/alice/' },
      }),
    })
    vi.stubGlobal('fetch', anonymousFetch)

    await expect(
      detectStorageConflict({
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        storageProviderUrl: 'https://id.undefineds.co',
        storageProviderPublicUrl: 'https://id.undefineds.co/',
        fetch: authenticatedFetch as typeof fetch,
      }),
    ).resolves.toBeNull()

    expect(authenticatedFetch).toHaveBeenCalledWith(
      'https://id.undefineds.co/alice/profile/card#me',
      expect.anything(),
    )
    expect(anonymousFetch).not.toHaveBeenCalled()
  })

  it('falls back to public profile fetch when authenticated profile fetch is rejected by token audience', async () => {
    vi.useFakeTimers()
    const anonymousFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/alice/profile/card#me',
        'solid:storage': { '@id': 'https://node-abc123.undefineds.co/alice/' },
      }),
    })
    const authenticatedFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => 'unauthorized',
    })
    vi.stubGlobal('fetch', anonymousFetch)

    const resultPromise = detectStorageConflict({
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        storageProviderPublicUrl: 'https://node-abc123.undefineds.co/',
        fetch: authenticatedFetch as typeof fetch,
    })

    await vi.advanceTimersByTimeAsync(1_000)
    await expect(resultPromise).resolves.toBeNull()

    expect(authenticatedFetch).toHaveBeenCalledWith(
      'https://id.undefineds.co/alice/profile/card#me',
      expect.anything(),
    )
    expect(anonymousFetch).toHaveBeenCalledWith(
      'https://id.undefineds.co/alice/profile/card#me',
      expect.anything(),
    )
  })

  it('does not treat the selected SP profile as the Cloud WebID profile authority', async () => {
    vi.useFakeTimers()
    const anonymousFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/alice/profile/card#me',
        'solid:storage': { '@id': 'https://node-abc123.undefineds.co/alice/' },
      }),
    })
    const authenticatedFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', anonymousFetch)

    await expect(
      detectStorageConflict({
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        storageProviderPublicUrl: 'https://node-abc123.undefineds.co/',
        fetch: authenticatedFetch as typeof fetch,
      }),
    ).resolves.toBeNull()

    expect(authenticatedFetch).toHaveBeenCalledWith(
      'https://id.undefineds.co/alice/profile/card#me',
      expect.anything(),
    )
    expect(anonymousFetch).toHaveBeenCalledWith(
      'https://id.undefineds.co/alice/profile/card#me',
      expect.anything(),
    )
    expect(authenticatedFetch).not.toHaveBeenCalledWith(
      'https://node-abc123.undefineds.co/alice/profile/card#me',
      expect.anything(),
    )
  })

  it('retries authenticated profile reads before falling back to anonymous fetch', async () => {
    vi.useFakeTimers()
    const anonymousFetch = vi.fn()
    const authenticatedFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: async () => 'unauthorized',
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/ld+json' }),
        text: async () => JSON.stringify({
          '@id': 'https://id.undefineds.co/alice/profile/card#me',
          'solid:storage': { '@id': 'https://node-abc123.undefineds.co/alice/' },
        }),
      })
    vi.stubGlobal('fetch', anonymousFetch)

    const resultPromise = detectStorageConflict({
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      storageProviderUrl: 'https://node-abc123.undefineds.co/',
      storageProviderPublicUrl: 'https://node-abc123.undefineds.co/',
      fetch: authenticatedFetch as typeof fetch,
    })

    await vi.advanceTimersByTimeAsync(250)
    await expect(resultPromise).resolves.toBeNull()

    expect(authenticatedFetch).toHaveBeenCalledTimes(2)
    expect(anonymousFetch).not.toHaveBeenCalled()
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
        storageProviderUrl: 'http://localhost:5737',
        storageProviderPublicUrl: 'https://node-abc123.undefineds.co/',
      }),
    ).resolves.toEqual({
      expectedStorageUrl: 'https://node-abc123.undefineds.co/alice/',
      actualStorageUrl: 'https://node-old999.undefineds.co/alice/',
      storageProviderUrl: 'http://localhost:5737',
      managementUrl: 'http://localhost:5737/.account/account/',
    })
  })

  it('reads profile storage from full RDF predicate IRIs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/alice/profile/card#me',
        'http://www.w3.org/ns/solid/terms#storage': {
          '@id': 'https://node-abc123.undefineds.co/alice/',
        },
      }),
    }))

    await expect(
      detectStorageConflict({
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        storageProviderUrl: 'http://localhost:5737',
        storageProviderPublicUrl: 'https://node-abc123.undefineds.co/',
      }),
    ).resolves.toBeNull()
  })

  it('reads Turtle profile storage from full RDF predicate IRIs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/turtle' }),
      text: async () => `
        <https://id.undefineds.co/alice/profile/card#me>
          <http://www.w3.org/ns/solid/terms#storage> <https://node-old999.undefineds.co/alice/> .
      `,
    }))

    await expect(
      detectStorageConflict({
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        storageProviderUrl: 'http://localhost:5737',
        storageProviderPublicUrl: 'https://node-abc123.undefineds.co/',
      }),
    ).resolves.toEqual({
      expectedStorageUrl: 'https://node-abc123.undefineds.co/alice/',
      actualStorageUrl: 'https://node-old999.undefineds.co/alice/',
      storageProviderUrl: 'http://localhost:5737',
      managementUrl: 'http://localhost:5737/.account/account/',
    })
  })

  it('returns a conflict when Cloud+Local login still points at Cloud storage', async () => {
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
        storageProviderUrl: 'http://localhost:5737',
        storageProviderPublicUrl: 'https://node-abc123.undefineds.co/',
      }),
    ).resolves.toEqual({
      expectedStorageUrl: 'https://node-abc123.undefineds.co/alice/',
      actualStorageUrl: 'https://id.undefineds.co/alice/',
      storageProviderUrl: 'http://localhost:5737',
      managementUrl: 'http://localhost:5737/.account/account/',
    })
  })

  it('keeps Local storage path strict even when the profile storage is under the same origin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/alice/profile/card#me',
        'solid:storage': { '@id': 'https://node-abc123.undefineds.co/users/alice/' },
      }),
    }))

    await expect(
      detectStorageConflict({
        webId: 'https://id.undefineds.co/alice/profile/card#me',
        storageProviderUrl: 'http://localhost:5737',
        storageProviderPublicUrl: 'https://node-abc123.undefineds.co/',
        strictStoragePath: true,
      }),
    ).resolves.toEqual({
      expectedStorageUrl: 'https://node-abc123.undefineds.co/alice/',
      actualStorageUrl: 'https://node-abc123.undefineds.co/users/alice/',
      storageProviderUrl: 'http://localhost:5737',
      managementUrl: 'http://localhost:5737/.account/account/',
    })
  })

  it('returns a conflict when the profile has no solid:storage binding', async () => {
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
        storageProviderUrl: 'http://localhost:5737',
        storageProviderPublicUrl: 'https://node-abc123.undefineds.co/',
      }),
    ).resolves.toEqual({
      expectedStorageUrl: 'https://node-abc123.undefineds.co/alice/',
      actualStorageUrl: null,
      storageProviderUrl: 'http://localhost:5737',
      managementUrl: 'http://localhost:5737/.account/account/',
    })
  })

  it('accepts custom provider storage under the selected provider base', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/turtle' }),
      text: async () => `
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        <https://solid.example.net/bob/profile/card#me>
          solid:storage <https://solid.example.net/users/bob/> .
      `,
    }))

    await expect(
      detectStorageConflict({
        webId: 'https://solid.example.net/bob/profile/card#me',
        storageProviderUrl: 'https://solid.example.net/',
        storageProviderPublicUrl: 'https://solid.example.net/',
        strictStoragePath: false,
      }),
    ).resolves.toBeNull()
  })

  it('rejects custom provider storage outside the selected provider base', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/turtle' }),
      text: async () => `
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        <https://solid.example.net/bob/profile/card#me>
          solid:storage <https://other.example.net/users/bob/> .
      `,
    }))

    await expect(
      detectStorageConflict({
        webId: 'https://solid.example.net/bob/profile/card#me',
        storageProviderUrl: 'https://solid.example.net/',
        storageProviderPublicUrl: 'https://solid.example.net/',
        strictStoragePath: false,
      }),
    ).resolves.toEqual({
      expectedStorageUrl: 'https://solid.example.net/',
      actualStorageUrl: 'https://other.example.net/users/bob/',
      storageProviderUrl: 'https://solid.example.net/',
      managementUrl: 'https://solid.example.net/.account/account/',
    })
  })
})
