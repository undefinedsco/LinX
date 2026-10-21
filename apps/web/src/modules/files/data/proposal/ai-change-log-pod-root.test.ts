import { beforeEach, describe, expect, it, vi } from 'vitest'

const adapter = vi.hoisted(() => ({
  readRawTextResource: vi.fn(),
  createRawTextResource: vi.fn(),
  saveRawTextResource: vi.fn(),
}))
vi.mock('../pod-adapter', () => adapter)

import { readAiCellChanges } from './ai-cell-change-commands'
import { readAiColumnChanges } from './ai-column-change-commands'

// A path-based Pod: the Pod root is `/test/`, not the server origin.
const db = { getDialect: () => ({ getPodUrl: () => 'http://localhost:3000/test/' }) } as any
const documentUri = 'http://localhost:3000/test/work/orders.ttl'

describe('LinX change logs in a path-based Pod', () => {
  beforeEach(() => {
    adapter.readRawTextResource.mockReset()
    adapter.readRawTextResource.mockRejectedValue(new Error('HTTP 404'))
  })

  it('reads the cell and column logs from the Pod, not the server origin', async () => {
    await readAiCellChanges(db, documentUri)
    await readAiColumnChanges(db, documentUri)

    const uris = adapter.readRawTextResource.mock.calls.map((call) => call[1] as string)
    expect(uris).toHaveLength(2)
    expect(uris[0]).toMatch(/^http:\/\/localhost:3000\/test\/\.data\/proposals\/cell-ai\//)
    expect(uris[1]).toMatch(/^http:\/\/localhost:3000\/test\/\.data\/proposals\/column-ai\//)
  })
})
