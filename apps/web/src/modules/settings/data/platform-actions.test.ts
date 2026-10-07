import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OPEN_SERVICE_MANAGEMENT_EVENT,
  openSettingsExternalUrl,
  requestOpenServiceManagement,
} from './platform-actions'

describe('settings platform actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete window.xpodDesktop
  })

  afterEach(() => {
    delete window.xpodDesktop
  })

  it('uses the desktop bridge to open external URLs when available', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    const browserOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    window.xpodDesktop = { app: { openExternal } } as typeof window.xpodDesktop

    await openSettingsExternalUrl('https://example.com/release')

    expect(openExternal).toHaveBeenCalledWith('https://example.com/release')
    expect(browserOpen).not.toHaveBeenCalled()
  })

  it('falls back to a noopener browser tab', async () => {
    const browserOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    await openSettingsExternalUrl('https://example.com/release')

    expect(browserOpen).toHaveBeenCalledWith(
      'https://example.com/release',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('dispatches the service-management request event', () => {
    const listener = vi.fn()
    window.addEventListener(OPEN_SERVICE_MANAGEMENT_EVENT, listener)

    requestOpenServiceManagement()

    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(OPEN_SERVICE_MANAGEMENT_EVENT, listener)
  })
})
