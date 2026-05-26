import { describe, expect, it } from 'vitest'
import { resolveCurrentPodBaseUrl } from './current-pod-base'

describe('resolveCurrentPodBaseUrl', () => {
  it('prefers the current database SP Pod URL over the WebID origin', () => {
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
      }),
    } as any

    expect(resolveCurrentPodBaseUrl(db)).toBe(
      'https://node-0000.undefineds.co/alice',
    )
  })

  it('does not derive a business write base from the actor WebID', () => {
    expect(resolveCurrentPodBaseUrl({} as any)).toBeNull()
  })
})
