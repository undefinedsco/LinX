import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractPodUrlFromWebId, resolvePodUrl } from './pod-url'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('pod-url shared alignment', () => {
  it('derives pod url from webId via shared @linx/models client helper', () => {
    expect(extractPodUrlFromWebId('https://pod.example/profile/card#me')).toBe('https://pod.example/profile')
    expect(extractPodUrlFromWebId('not-a-url')).toBe('')
  })

  it('falls back to shared derived pod url when local service is unavailable', async () => {
    const result = await resolvePodUrl('https://pod.example/profile/card#me')
    expect(result).toBe('https://pod.example/profile')
  })

  it('prefers local service pod url when runtime service is available', async () => {
    vi.stubGlobal('window', { __LINX_SERVICE__: true })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        pod: {
          publicUrl: 'http://localhost:5737/profile/',
        },
      }),
    })))

    const result = await resolvePodUrl('https://pod.example/profile/card#me')
    expect(result).toBe('http://localhost:5737/profile')
  })
})
