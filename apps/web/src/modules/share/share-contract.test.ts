import { describe, expect, it } from 'vitest'
import { createSharePreview } from './share-contract'

describe('createSharePreview', () => {
  it('uses canonical resource URL for Cloud link and QR payload', () => {
    const preview = createSharePreview({
      canonicalResourceUrl: 'https://cloud.undefineds.co/alice/chat/x/',
      storage: { kind: 'cloud' },
    })

    expect(preview.linkUrl).toBe('https://cloud.undefineds.co/alice/chat/x/')
    expect(preview.qrPayload).toBe('https://cloud.undefineds.co/alice/chat/x/')
    expect(preview.storageLabel).toBe('云端空间')
    expect(preview.hint).toBe('拥有权限的人可通过链接访问。')
  })

  it('uses canonical resource URL for Local link and QR payload', () => {
    const now = new Date('2026-07-02T12:00:00.000Z').getTime()
    const preview = createSharePreview({
      canonicalResourceUrl: 'https://node-0000.undefineds.co/alice/chat/x/',
      storage: {
        kind: 'local',
        lastHeartbeatAt: now,
        now: () => now,
      },
    })

    expect(preview.linkUrl).toBe('https://node-0000.undefineds.co/alice/chat/x/')
    expect(preview.qrPayload).toBe('https://node-0000.undefineds.co/alice/chat/x/')
    expect(preview.storageLabel).toBe('本机空间')
    expect(preview.hint).toBe('本机空间最近在线。对方访问时仍需保持在线。')
  })

  it('uses stale heartbeat as a weak hint and does not block generation', () => {
    const now = new Date('2026-07-02T12:00:00.000Z').getTime()
    const preview = createSharePreview({
      canonicalResourceUrl: 'https://node-0000.undefineds.co/alice/file.txt',
      storage: {
        kind: 'local',
        lastHeartbeatAt: now - 10 * 60 * 1000,
        now: () => now,
      },
    })

    expect(preview.linkUrl).toBe('https://node-0000.undefineds.co/alice/file.txt')
    expect(preview.hint).toBe('本机空间可能离线。链接仍可创建，对方打开时会再次检测。')
    expect(preview.blocksShare).toBe(false)
  })

  it('rejects credential-bearing share URLs', () => {
    expect(() => createSharePreview({
      canonicalResourceUrl: 'https://node-0000.undefineds.co/alice/file.txt?provisionCode=pc-123',
      storage: { kind: 'local' },
    })).toThrow('Share URL must not contain credentials or provision data')

    expect(() => createSharePreview({
      canonicalResourceUrl: 'https://cloud.undefineds.co/alice/file.txt#access_token=abc',
      storage: { kind: 'cloud' },
    })).toThrow('Share URL must not contain credentials or provision data')
  })
})
