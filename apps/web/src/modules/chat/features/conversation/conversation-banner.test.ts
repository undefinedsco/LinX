import { describe, expect, it } from 'vitest'
import { selectConversationBanner, type ConversationBannerState } from './conversation-banner'

const calm: ConversationBannerState = {
  serviceAccessRequired: false,
  matrixAuthorizationRequired: false,
  online: true,
  loadError: false,
  reconnectStatus: 'idle',
}

describe('selectConversationBanner', () => {
  it('shows nothing when nothing is wrong', () => {
    expect(selectConversationBanner(calm)).toBeNull()
  })

  it('picks each banner on its own', () => {
    expect(selectConversationBanner({ ...calm, serviceAccessRequired: true })).toBe('service-access')
    expect(selectConversationBanner({ ...calm, matrixAuthorizationRequired: true })).toBe('matrix-authorization')
    expect(selectConversationBanner({ ...calm, online: false })).toBe('offline')
    expect(selectConversationBanner({ ...calm, loadError: true })).toBe('load-error')
    expect(selectConversationBanner({ ...calm, reconnectStatus: 'syncing' })).toBe('reconnect')
    expect(selectConversationBanner({ ...calm, reconnectStatus: 'error' })).toBe('reconnect')
  })

  it('puts actions the user must take before everything else', () => {
    const all = { ...calm, serviceAccessRequired: true, matrixAuthorizationRequired: true, online: false, loadError: true, reconnectStatus: 'error' as const }
    expect(selectConversationBanner(all)).toBe('service-access')
    expect(selectConversationBanner({ ...all, serviceAccessRequired: false })).toBe('matrix-authorization')
    expect(selectConversationBanner({ ...all, matrixAuthorizationRequired: false, serviceAccessRequired: false })).toBe('offline')
  })

  it('shows offline before load error, and load error before reconnect', () => {
    expect(selectConversationBanner({ ...calm, online: false, loadError: true, reconnectStatus: 'syncing' })).toBe('offline')
    expect(selectConversationBanner({ ...calm, loadError: true, reconnectStatus: 'syncing' })).toBe('load-error')
  })
})
