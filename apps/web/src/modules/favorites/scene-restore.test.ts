import { describe, expect, it } from 'vitest'
import { SCHEMA, type FavoriteRow } from '@undefineds.co/models'
import { resolveFavoriteScene } from './scene-restore'

function createFavorite(overrides: Partial<FavoriteRow>): FavoriteRow {
  return {
    id: 'fav-1',
    targetType: SCHEMA.CreativeWork,
    target: 'chat-1',
    title: 'Favorite',
    snapshotContent: null,
    snapshotAuthor: null,
    sourceModule: 'chat',
    searchText: 'Favorite',
    snapshotMeta: null,
    favoredAt: new Date('2026-03-27T00:00:00Z'),
    updatedAt: new Date('2026-03-27T00:00:00Z'),
    ...overrides,
  } as FavoriteRow
}

describe('resolveFavoriteScene', () => {
  it('resolves chat favorites to the chat scene', () => {
    expect(resolveFavoriteScene(createFavorite({
      sourceModule: 'chat',
      target: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
    }))).toEqual({
      microAppId: 'chat',
      chatId: 'chat-1',
      threadId: null,
      messageId: null,
    })
  })

  it('resolves thread favorites from chat target URI', () => {
    expect(resolveFavoriteScene(createFavorite({
      sourceModule: 'thread',
      target: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-9',
    }))).toEqual({
      microAppId: 'chat',
      chatId: 'chat-1',
      threadId: 'thread-9',
      messageId: null,
    })
  })

  it('resolves base-relative chat target refs through shared model helpers', () => {
    expect(resolveFavoriteScene(createFavorite({
      sourceModule: 'thread',
      target: '/.data/chat/chat-1/index.ttl#thread-9',
    }))).toEqual({
      microAppId: 'chat',
      chatId: 'chat-1',
      threadId: 'thread-9',
      messageId: null,
    })
  })

  it('resolves message favorites using snapshot meta when available', () => {
    expect(resolveFavoriteScene(createFavorite({
      sourceModule: 'messages',
      target: 'https://alice.example/.data/chat/chat-1/2026/03/27/messages.ttl#msg-3',
      snapshotMeta: JSON.stringify({
        chatId: 'chat-1',
        threadId: 'thread-2',
      }),
    }))).toEqual({
      microAppId: 'chat',
      chatId: 'chat-1',
      threadId: 'thread-2',
      messageId: 'msg-3',
    })
  })

  it('resolves contact and file favorites to their module scenes', () => {
    expect(resolveFavoriteScene(createFavorite({
      sourceModule: 'contacts',
      target: 'https://alice.example/profile/card#me',
    }))).toEqual({
      microAppId: 'contacts',
      contactId: 'https://alice.example/profile/card#me',
    })

    expect(resolveFavoriteScene(createFavorite({
      sourceModule: 'files',
      target: 'https://pod.example/public/file-1.md',
      snapshotMeta: JSON.stringify({ treeNodeId: 'starred' }),
    }))).toEqual({
      microAppId: 'files',
      fileId: 'https://pod.example/public/file-1.md',
      treeNodeId: 'starred',
    })
  })
})
