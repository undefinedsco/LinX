import { describe, expect, it } from 'vitest'
import {
  filterRowsToCurrentPod,
  isResourceWithinCurrentPod,
} from './current-pod-base'

function databaseFor(podUrl: string) {
  return {
    getDialect: () => ({ getPodUrl: () => podUrl }),
  } as never
}

describe('current Pod resource boundary', () => {
  const db = databaseFor('http://localhost:5737/cuilinsu/')

  it('accepts current-Pod and base-relative resource ids', () => {
    expect(isResourceWithinCurrentPod(db, 'http://localhost:5737/cuilinsu/.data/chat/one.ttl')).toBe(true)
    expect(isResourceWithinCurrentPod(db, 'chat/one.ttl#thread')).toBe(true)
  })

  it('treats local Docker loopback aliases as the same Pod origin', () => {
    expect(isResourceWithinCurrentPod(
      databaseFor('http://127.0.0.1:5737/cuilinsu/'),
      'http://localhost:5737/cuilinsu/.data/chat/one.ttl',
    )).toBe(true)
    expect(isResourceWithinCurrentPod(
      databaseFor('http://localhost:5737/cuilinsu/'),
      'http://127.0.0.1:5737/cuilinsu/.data/chat/one.ttl',
    )).toBe(true)
  })

  it('rejects rows returned from another Pod on the same server', () => {
    expect(isResourceWithinCurrentPod(db, 'http://localhost:5737/qa22383411/.data/chat/one.ttl')).toBe(false)
    expect(isResourceWithinCurrentPod(db, 'http://localhost:5737/spod/.data/chat/one.ttl')).toBe(false)
  })

  it('filters by canonical @id before falling back to row id', () => {
    const rows = filterRowsToCurrentPod(db, [
      { id: 'one', '@id': 'http://localhost:5737/cuilinsu/.data/chat/one.ttl' },
      { id: 'foreign', '@id': 'http://localhost:5737/qa22383411/.data/chat/foreign.ttl' },
      { id: 'relative' },
    ])

    expect(rows.map((row) => row.id)).toEqual(['one', 'relative'])
  })
})
