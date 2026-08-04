import { describe, expect, it } from 'vitest'
import { projectChatListFolderSections } from './chat-list-folder-model'

interface Row {
  id: string
  starred: boolean
  unreadCount: number
  title: string
}

const a: Row = { id: 'a', starred: true, unreadCount: 0, title: 'Secretary' }
const b: Row = { id: 'b', starred: true, unreadCount: 3, title: 'Pinned unread' }
const c: Row = { id: 'c', starred: false, unreadCount: 2, title: 'Unread' }
const d: Row = { id: 'd', starred: false, unreadCount: 0, title: 'Read' }
const e: Row = { id: 'e', starred: false, unreadCount: 1, title: 'Unread 2' }

describe('projectChatListFolderSections', () => {
  it('keeps every pinned item visible and lists all unpinned items under "all"', () => {
    const { pinned, unpinned } = projectChatListFolderSections([a, b, c, d, e], 'all')
    expect(pinned.map((row) => row.id)).toEqual(['a', 'b'])
    expect(unpinned.map((row) => row.id)).toEqual(['c', 'd', 'e'])
  })

  it('filters only the unpinned section by unread while pinned stays exempt', () => {
    const { pinned, unpinned } = projectChatListFolderSections([a, b, c, d, e], 'unread')
    expect(pinned.map((row) => row.id)).toEqual(['a', 'b'])
    expect(unpinned.map((row) => row.id)).toEqual(['c', 'e'])
  })

  it('preserves a pinned item with zero unread even under the unread filter', () => {
    const { pinned } = projectChatListFolderSections([a], 'unread')
    expect(pinned.map((row) => row.id)).toEqual(['a'])
  })

  it('preserves input order within each section', () => {
    const { unpinned } = projectChatListFolderSections([e, d, c], 'all')
    expect(unpinned.map((row) => row.id)).toEqual(['e', 'd', 'c'])
  })

  it('returns empty sections for empty input', () => {
    expect(projectChatListFolderSections([], 'all')).toEqual({ pinned: [], unpinned: [] })
    expect(projectChatListFolderSections([], 'unread')).toEqual({ pinned: [], unpinned: [] })
  })

  it('preserves extra fields through the generic return type', () => {
    const { pinned } = projectChatListFolderSections([a], 'all')
    expect(pinned[0].title).toBe('Secretary')
  })
})
