import { describe, expect, it } from 'vitest'
import { projectChatAssets } from './chat-asset-library'

describe('projectChatAssets', () => {
  it('projects and de-duplicates Pod attachments across conversations', () => {
    const assets = projectChatAssets([
      {
        id: 'm1',
        chat: 'chat-a',
        thread: 'thread-a',
        createdAt: '2026-08-10T00:00:00Z',
        richContent: JSON.stringify({ attachments: [{ id: 'a/1', type: 'image', name: 'old.png', mime_type: 'image/png' }] }),
      },
      {
        id: 'm2',
        chat: 'chat-b',
        thread: 'thread-b',
        createdAt: '2026-08-11T00:00:00Z',
        richContent: JSON.stringify({ attachments: [
          { id: 'a/1', type: 'image', name: 'latest.png', mime_type: 'image/png' },
          { id: 'doc', type: 'file', name: 'brief.pdf', mime_type: 'application/pdf' },
        ] }),
      },
    ], 'https://pod.example/alice/')

    expect(assets).toHaveLength(2)
    const image = assets.find((asset) => asset.id === 'a/1')
    expect(image).toMatchObject({ id: 'a/1', name: 'latest.png', chatRef: 'chat-b' })
    expect(image?.pod_url).toBe('https://pod.example/alice/.data/chat-attachments/a%2F1')
    expect(assets.find((asset) => asset.id === 'doc')).toMatchObject({ id: 'doc', type: 'file', name: 'brief.pdf' })
  })

  it('ignores malformed historical rich content', () => {
    expect(projectChatAssets([{ richContent: '{bad' }, { richContent: JSON.stringify({ attachments: [{ id: 1 }] }) }], 'https://pod.example/')).toEqual([])
  })
})
