import { describe, expect, it, vi } from 'vitest'
import {
  createSolidTypeIndexResourceTextReader,
  discoverSolidTypeIndexRegistrations,
  discoverSolidTypeIndexRegistrationsFromWebId,
} from './data/vocab/vocab-discovery'

describe('Files vocab discovery', () => {
  it('separates public and private Solid Type Index registrations without inferring from /.vocab paths', () => {
    const discovered = discoverSolidTypeIndexRegistrations({
      webId: 'https://id.example/alice#me',
      forClass: 'https://undefineds.co/vocab/VocabRegistry',
      profileTurtle: [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '@prefix pim: <http://www.w3.org/ns/pim/space#> .',
        '<https://id.example/alice#me> solid:publicTypeIndex <https://pod.example/settings/publicTypeIndex.ttl> ;',
        '  pim:preferencesFile <https://pod.example/settings/preferences.ttl> .',
      ].join('\n'),
      publicTypeIndexTurtle: [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '<#vocab> a solid:TypeRegistration ;',
        '  solid:forClass <https://undefineds.co/vocab/VocabRegistry> ;',
        '  solid:instance <https://pod.example/.vocab/terms.ttl> .',
        '<#other> a solid:TypeRegistration ;',
        '  solid:forClass <https://schema.org/BookmarkAction> ;',
        '  solid:instanceContainer <https://pod.example/bookmarks/> .',
      ].join('\n'),
      preferencesTurtle: [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '<https://id.example/alice#me> solid:privateTypeIndex <https://pod.example/settings/privateTypeIndex.ttl> .',
      ].join('\n'),
      privateTypeIndexTurtle: [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '<#private-vocab> a solid:TypeRegistration ;',
        '  solid:forClass <https://undefineds.co/vocab/VocabRegistry> ;',
        '  solid:instance <https://pod.example/private/.vocab/terms.ttl> .',
      ].join('\n'),
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
    })

    expect(discovered).toEqual({
      publicTypeIndexUri: 'https://pod.example/settings/publicTypeIndex.ttl',
      privateTypeIndexUri: 'https://pod.example/settings/privateTypeIndex.ttl',
      public: [{
        source: 'public',
        registrationUri: 'https://pod.example/settings/publicTypeIndex.ttl#vocab',
        forClass: 'https://undefineds.co/vocab/VocabRegistry',
        instance: 'https://pod.example/.vocab/terms.ttl',
        instanceContainer: null,
      }],
      private: [{
        source: 'private',
        registrationUri: 'https://pod.example/settings/privateTypeIndex.ttl#private-vocab',
        forClass: 'https://undefineds.co/vocab/VocabRegistry',
        instance: 'https://pod.example/private/.vocab/terms.ttl',
        instanceContainer: null,
      }],
    })
  })

  it('does not treat a conventional local vocab URI as discoverable without a Type Index registration', () => {
    expect(discoverSolidTypeIndexRegistrations({
      webId: 'https://id.example/alice#me',
      forClass: 'https://undefineds.co/vocab/VocabRegistry',
      profileTurtle: '',
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
    })).toEqual({
      publicTypeIndexUri: null,
      privateTypeIndexUri: null,
      public: [],
      private: [],
    })
  })

  it('hydrates Type Index registrations when a Pod returns expanded RDF triples', () => {
    const discovered = discoverSolidTypeIndexRegistrations({
      webId: 'https://id.example/alice#me',
      forClass: 'https://undefineds.co/vocab/VocabRegistry',
      profileTurtle: [
        '<https://id.example/alice#me> <http://www.w3.org/ns/solid/terms#publicTypeIndex> <https://pod.example/settings/publicTypeIndex.ttl> .',
      ].join('\n'),
      publicTypeIndexTurtle: [
        '<https://pod.example/settings/publicTypeIndex.ttl#vocab> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/solid/terms#TypeRegistration> .',
        '<https://pod.example/settings/publicTypeIndex.ttl#vocab> <http://www.w3.org/ns/solid/terms#forClass> <https://undefineds.co/vocab/VocabRegistry> .',
        '<https://pod.example/settings/publicTypeIndex.ttl#vocab> <http://www.w3.org/ns/solid/terms#instance> <https://pod.example/.vocab/terms.ttl> .',
      ].join('\n'),
    })

    expect(discovered.public).toEqual([{
      source: 'public',
      registrationUri: 'https://pod.example/settings/publicTypeIndex.ttl#vocab',
      forClass: 'https://undefineds.co/vocab/VocabRegistry',
      instance: 'https://pod.example/.vocab/terms.ttl',
      instanceContainer: null,
    }])
  })

  it('resolves relative Type Index and registration IRIs against their containing resources', async () => {
    const documents = new Map([
      ['https://id.example/profile/card', [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '@prefix pim: <http://www.w3.org/ns/pim/space#> .',
        '<#me> solid:publicTypeIndex </settings/publicTypeIndex.ttl> ;',
        '  pim:preferencesFile </settings/preferences.ttl> .',
      ].join('\n')],
      ['https://id.example/settings/publicTypeIndex.ttl', [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '<#vocab> a solid:TypeRegistration ;',
        '  solid:forClass <https://undefineds.co/vocab/VocabRegistry> ;',
        '  solid:instance <../.vocab/terms.ttl> .',
      ].join('\n')],
      ['https://id.example/settings/preferences.ttl', [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '<#prefs> solid:privateTypeIndex <privateTypeIndex.ttl> .',
      ].join('\n')],
      ['https://id.example/settings/privateTypeIndex.ttl', [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '<#private-vocab> a solid:TypeRegistration ;',
        '  solid:forClass <https://undefineds.co/vocab/VocabRegistry> ;',
        '  solid:instanceContainer </private/.vocab/> .',
      ].join('\n')],
    ])
    const readResourceText = vi.fn(async (uri: string) => documents.get(uri) ?? null)

    await expect(discoverSolidTypeIndexRegistrationsFromWebId({
      webId: 'https://id.example/profile/card#me',
      forClass: 'https://undefineds.co/vocab/VocabRegistry',
      readResourceText,
    })).resolves.toEqual({
      publicTypeIndexUri: 'https://id.example/settings/publicTypeIndex.ttl',
      privateTypeIndexUri: 'https://id.example/settings/privateTypeIndex.ttl',
      public: [{
        source: 'public',
        registrationUri: 'https://id.example/settings/publicTypeIndex.ttl#vocab',
        forClass: 'https://undefineds.co/vocab/VocabRegistry',
        instance: 'https://id.example/.vocab/terms.ttl',
        instanceContainer: null,
      }],
      private: [{
        source: 'private',
        registrationUri: 'https://id.example/settings/privateTypeIndex.ttl#private-vocab',
        forClass: 'https://undefineds.co/vocab/VocabRegistry',
        instance: null,
        instanceContainer: 'https://id.example/private/.vocab/',
      }],
    })
    expect(readResourceText).toHaveBeenCalledWith('https://id.example/settings/publicTypeIndex.ttl')
    expect(readResourceText).toHaveBeenCalledWith('https://id.example/settings/preferences.ttl')
    expect(readResourceText).toHaveBeenCalledWith('https://id.example/settings/privateTypeIndex.ttl')
  })

  it('reads WebID profile, public index, preferences, and private index through an injected reader', async () => {
    const documents = new Map([
      ['https://id.example/alice', [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '@prefix pim: <http://www.w3.org/ns/pim/space#> .',
        '<https://id.example/alice#me> solid:publicTypeIndex <https://pod.example/settings/publicTypeIndex.ttl> ;',
        '  pim:preferencesFile <https://pod.example/settings/preferences.ttl> .',
      ].join('\n')],
      ['https://pod.example/settings/publicTypeIndex.ttl', [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '<#vocab> a solid:TypeRegistration ;',
        '  solid:forClass <https://undefineds.co/vocab/VocabRegistry> ;',
        '  solid:instance <https://pod.example/.vocab/terms.ttl> .',
      ].join('\n')],
      ['https://pod.example/settings/preferences.ttl', [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '<https://id.example/alice#me> solid:privateTypeIndex <https://pod.example/settings/privateTypeIndex.ttl> .',
      ].join('\n')],
      ['https://pod.example/settings/privateTypeIndex.ttl', [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '<#private-vocab> a solid:TypeRegistration ;',
        '  solid:forClass <https://undefineds.co/vocab/VocabRegistry> ;',
        '  solid:instance <https://pod.example/private/.vocab/terms.ttl> .',
      ].join('\n')],
    ])
    const readResourceText = vi.fn(async (uri: string) => documents.get(uri) ?? null)

    await expect(discoverSolidTypeIndexRegistrationsFromWebId({
      webId: 'https://id.example/alice#me',
      forClass: 'https://undefineds.co/vocab/VocabRegistry',
      readResourceText,
    })).resolves.toMatchObject({
      publicTypeIndexUri: 'https://pod.example/settings/publicTypeIndex.ttl',
      privateTypeIndexUri: 'https://pod.example/settings/privateTypeIndex.ttl',
      public: [{ instance: 'https://pod.example/.vocab/terms.ttl' }],
      private: [{ instance: 'https://pod.example/private/.vocab/terms.ttl' }],
    })
    expect(readResourceText).toHaveBeenCalledTimes(4)
    expect(readResourceText).toHaveBeenNthCalledWith(1, 'https://id.example/alice')
  })

  it('keeps public discovery when private preferences or index resources are unavailable', async () => {
    const readResourceText = vi.fn(async (uri: string) => {
      if (uri === 'https://id.example/alice') {
        return [
          '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
          '@prefix pim: <http://www.w3.org/ns/pim/space#> .',
          '<https://id.example/alice#me> solid:publicTypeIndex <https://pod.example/settings/publicTypeIndex.ttl> ;',
          '  pim:preferencesFile <https://pod.example/settings/preferences.ttl> .',
        ].join('\n')
      }
      if (uri === 'https://pod.example/settings/publicTypeIndex.ttl') {
        return [
          '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
          '<#vocab> a solid:TypeRegistration ;',
          '  solid:forClass <https://undefineds.co/vocab/VocabRegistry> ;',
          '  solid:instance <https://pod.example/.vocab/terms.ttl> .',
        ].join('\n')
      }
      throw new Error('HTTP 403')
    })

    await expect(discoverSolidTypeIndexRegistrationsFromWebId({
      webId: 'https://id.example/alice#me',
      forClass: 'https://undefineds.co/vocab/VocabRegistry',
      readResourceText,
    })).resolves.toEqual({
      publicTypeIndexUri: 'https://pod.example/settings/publicTypeIndex.ttl',
      privateTypeIndexUri: null,
      public: [{
        source: 'public',
        registrationUri: 'https://pod.example/settings/publicTypeIndex.ttl#vocab',
        forClass: 'https://undefineds.co/vocab/VocabRegistry',
        instance: 'https://pod.example/.vocab/terms.ttl',
        instanceContainer: null,
      }],
      private: [],
    })
  })

  it('adapts authenticated fetch into a resource text reader for Type Index discovery', async () => {
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        Accept: 'text/turtle, text/*;q=0.9, application/ld+json;q=0.8, */*;q=0.1',
      })
      if (String(uri).endsWith('/missing.ttl')) return new Response('missing', { status: 404 })
      return new Response('<#this> a <#Thing> .', {
        status: 200,
        headers: { 'Content-Type': 'text/turtle' },
      })
    })
    const reader = createSolidTypeIndexResourceTextReader(authFetch)

    await expect(reader('https://pod.example/settings/publicTypeIndex.ttl')).resolves.toBe('<#this> a <#Thing> .')
    await expect(reader('https://pod.example/settings/missing.ttl')).resolves.toBeNull()
    expect(authFetch).toHaveBeenCalledWith('https://pod.example/settings/publicTypeIndex.ttl', expect.objectContaining({
      method: 'GET',
    }))
  })
})
