import { describe, expect, it } from 'vitest'
import { resolveSpaceAttention, resolveSpaceKind, spaceKindLabel } from './space-status'

describe('space status', () => {
  it('names where the data lives', () => {
    expect(spaceKindLabel(resolveSpaceKind({ storageProviderLabel: 'local', issuerUrl: 'https://id.example' }))).toBe('本机')
    expect(spaceKindLabel(resolveSpaceKind({ issuerUrl: 'http://localhost:3000' }))).toBe('独立')
    expect(spaceKindLabel(resolveSpaceKind({ issuerUrl: 'https://id.undefineds.co' }))).toBe('云端')
    expect(spaceKindLabel(resolveSpaceKind(null))).toBe('云端')
  })

  it('says nothing when everything is fine or still unknown', () => {
    expect(resolveSpaceAttention({ online: true, databaseStatus: 'ready', aiConnected: true })).toBeNull()
    expect(resolveSpaceAttention({ online: true, databaseStatus: 'initializing', aiConnected: null })).toBeNull()
  })

  it('reports one problem at a time, most fundamental first', () => {
    expect(resolveSpaceAttention({ online: false, databaseStatus: 'error', aiConnected: false })).toMatchObject({
      kind: 'offline',
      severity: 'info',
      message: '没有网络，修改会在恢复后保存',
    })
    expect(resolveSpaceAttention({ online: true, databaseStatus: 'error', aiConnected: false })).toMatchObject({
      kind: 'cannot-save',
      action: { id: 'open-space-settings', label: '查看' },
    })
    expect(resolveSpaceAttention({ online: true, databaseStatus: 'ready', aiConnected: false })).toMatchObject({
      kind: 'ai-not-connected',
      action: { id: 'connect-ai', label: '去连接' },
    })
  })
})
