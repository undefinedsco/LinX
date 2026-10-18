import { describe, expect, it } from 'vitest'

import {
  buildWhiteboardCardIndex,
  isWhiteboardSpaceTableEntry,
  projectWhiteboardSpaceRows,
  projectWhiteboardUsedOnLabel,
  whiteboardBoardName,
} from './whiteboard-space-index'

const POD = 'https://pod.example/'

describe('whiteboard space index', () => {
  it('lists rows of other tables, not this one', () => {
    const rows = projectWhiteboardSpaceRows([
      { uri: `${POD}活动/志愿者.ttl`, cards: [{ subject: '#a', title: '周禾', className: null, summary: '', tags: [] }] },
      { uri: `${POD}活动/排班.ttl`, cards: [{ subject: '#b', title: '周六', className: null, summary: '', tags: [] }] },
    ], { excludeDocumentUri: `${POD}活动/排班.ttl` })
    expect(rows).toEqual([{ uri: `${new URL(`${POD}活动/志愿者.ttl`).href}#a`, title: '周禾', subtitle: '志愿者', summary: '', className: null }])
  })

  it('finds which other boards a card is on', () => {
    const board = (viewOf: string, file: string, subpath?: string) => JSON.stringify({
      nodes: [{ id: 'n1', type: 'file', x: 0, y: 0, width: 10, height: 10, file, ...(subpath ? { subpath } : {}) }],
      edges: [],
      linx: { version: 1, viewOf },
    })
    const index = buildWhiteboardCardIndex([
      { uri: 'b1', content: board(`${POD}读书会.ttl`, '读书会.ttl', '#a') },
      { uri: 'b2', content: board(`${POD}排班.ttl`, '读书会.ttl', '#a') },
      { uri: 'b3', content: 'not json' },
    ], { currentBoardUri: 'b2', podRootUri: POD })
    expect(index.get(`${POD}读书会.ttl#a`)).toEqual(['读书会'])
    expect(projectWhiteboardUsedOnLabel(index.get(`${POD}读书会.ttl#a`))).toBe('已在“读书会”白板上')
    expect(projectWhiteboardUsedOnLabel(['a', 'b', 'c'])).toContain('等 3 块')
    expect(projectWhiteboardUsedOnLabel(undefined)).toBeNull()
  })

  it('names boards after what they view and skips system records as tables', () => {
    expect(whiteboardBoardName(`${POD}%E6%B4%BB%E5%8A%A8/%E6%8E%92%E7%8F%AD.ttl`, 'x')).toBe('排班')
    expect(isWhiteboardSpaceTableEntry({ kind: 'resource', semanticKind: 'structured-data', mimeType: 'text/turtle', uri: `${POD}a.ttl` } as never)).toBe(true)
    expect(isWhiteboardSpaceTableEntry({ kind: 'resource', semanticKind: 'structured-data', mimeType: 'text/turtle', uri: `${POD}.data/proposals/x.ttl` } as never)).toBe(false)
    expect(isWhiteboardSpaceTableEntry({ kind: 'container', semanticKind: 'folder', mimeType: null, uri: `${POD}a/` } as never)).toBe(false)
  })
})
