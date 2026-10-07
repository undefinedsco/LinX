import { describe, expect, it } from 'vitest'
import { LINX_DEFAULT_SECRETARY } from '../collections'
import {
  orderChatItems,
  projectSecretaryListCapabilities,
} from './secretary-entry-model'

describe('secretary entry model', () => {
  it('orders Secretary before starred and ordinary chats', () => {
    const starred = { id: 'starred', title: 'Starred', starred: true }
    const secretary = {
      id: LINX_DEFAULT_SECRETARY.chatId,
      title: 'Renamed Secretary',
      starred: false,
    }
    const ordinary = { id: 'ordinary', title: 'Ordinary', starred: false }

    expect(orderChatItems([starred, secretary, ordinary]).map((item) => item.id))
      .toEqual([LINX_DEFAULT_SECRETARY.chatId, starred.id, ordinary.id])
  })

  it('preserves source order within ordinary starred and unstarred groups', () => {
    const ordinaryFirst = { id: 'ordinary-first', title: 'Ordinary first', starred: false }
    const starredFirst = { id: 'starred-first', title: 'Starred first', starred: true }
    const ordinarySecond = { id: 'ordinary-second', title: 'Ordinary second', starred: false }
    const starredSecond = { id: 'starred-second', title: 'Starred second', starred: true }

    expect(orderChatItems([
      ordinaryFirst,
      starredFirst,
      ordinarySecond,
      starredSecond,
    ]).map((item) => item.id)).toEqual([
      starredFirst.id,
      starredSecond.id,
      ordinaryFirst.id,
      ordinarySecond.id,
    ])
  })

  it('projects Secretary as permanently pinned and protected', () => {
    expect(projectSecretaryListCapabilities({
      title: LINX_DEFAULT_SECRETARY.title,
      starred: false,
    })).toEqual({
      isPinned: true,
      isProtected: true,
      canTogglePin: false,
      canDelete: false,
    })
  })

  it('keeps ordinary chat capabilities derived from stored starred state', () => {
    expect(projectSecretaryListCapabilities({
      title: 'Ordinary chat',
      starred: true,
    })).toEqual({
      isPinned: true,
      isProtected: false,
      canTogglePin: true,
      canDelete: true,
    })
  })
})
