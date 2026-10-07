import { describe, expect, it, vi } from 'vitest'
import { benchmarkPrivateFilesReadPath } from './private-cloud-benchmark'

describe('benchmarkPrivateFilesReadPath', () => {
  it('measures private resources exclusively through the authenticated fetch', async () => {
    const authFetch = vi.fn(async () => new Response('private pod content', { status: 200 }))

    const results = await benchmarkPrivateFilesReadPath({
      authFetch,
      folderUri: 'https://pod.example/private/',
      fileUri: 'https://pod.example/private/card.ttl',
      iterations: 1,
    })

    expect(authFetch).toHaveBeenCalledTimes(6)
    expect(authFetch.mock.calls.every(([url]) => String(url).startsWith('https://pod.example/private/'))).toBe(true)
    expect(results.map((result) => [result.name, result.status, result.requests])).toEqual([
      ['Private folder GET', 200, 1],
      ['Private file HEAD', 200, 1],
      ['Private file GET', 200, 1],
      ['Legacy open (HEAD -> GET)', 200, 2],
      ['Current open (GET)', 200, 1],
    ])
  })
})
