import { describe, expect, it } from 'vitest'
import { createDataLayer } from './data-layer'

describe('micro-app data layer row identity', () => {
  it('requires base-relative row ids when hydrating list rows', () => {
    const layer = createDataLayer({
      id: 'chat' as any,
      descriptor: createDescriptor(),
      listConfig: {},
      detailConfig: {
        initialViewState: () => ({ mode: 'create' as const }),
      },
    })

    expect(() => layer.hydrateList([
      { id: 'https://pod.example/.data/chat/chat-1/index.ttl#this', title: 'bad' },
    ])).toThrow('base-relative resource id')
  })

  it('uses row.id as the application identifier only after validating it', () => {
    const layer = createDataLayer({
      id: 'chat' as any,
      descriptor: createDescriptor(),
      listConfig: {},
      detailConfig: {
        initialViewState: () => ({ mode: 'create' as const }),
      },
    })

    const rows = layer.hydrateList([{ id: 'chat-1', title: 'ok' }])

    expect(rows).toEqual([{ id: 'chat-1', title: 'ok' }])
  })
})

function createDescriptor() {
  return {
    namespace: 'test',
    invalidations: {},
    list: async () => [],
    detail: async () => null,
  } as any
}
