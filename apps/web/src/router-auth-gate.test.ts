import { describe, expect, it } from 'vitest'
import { shouldRenderAuthenticatedOutlet, shouldRenderLoginOverlay } from './router'

describe('router auth gate', () => {
  it('blocks normal app routes until both Solid and LinX login state are ready', () => {
    expect(shouldRenderAuthenticatedOutlet({
      pathname: '/chat',
      isLoggedIn: true,
      sessionRequestInProgress: false,
      loginState: 'idle',
    })).toBe(false)

    expect(shouldRenderAuthenticatedOutlet({
      pathname: '/chat',
      isLoggedIn: false,
      sessionRequestInProgress: false,
      loginState: 'authenticated',
    })).toBe(false)

    expect(shouldRenderAuthenticatedOutlet({
      pathname: '/chat',
      isLoggedIn: true,
      sessionRequestInProgress: true,
      loginState: 'authenticated',
    })).toBe(false)
  })

  it('allows normal app routes only after login is fully finalized', () => {
    expect(shouldRenderAuthenticatedOutlet({
      pathname: '/chat',
      isLoggedIn: true,
      sessionRequestInProgress: false,
      loginState: 'authenticated',
    })).toBe(true)
  })

  it('keeps callback and diagnostic routes available before authentication', () => {
    for (const pathname of [
      '/auth/callback',
      '/auth/callback?code=abc',
      '/test/solid-ui-react',
      '/debug/chat',
      '/setup',
      '/inrupt-test',
    ]) {
      expect(shouldRenderAuthenticatedOutlet({
        pathname,
        isLoggedIn: false,
        sessionRequestInProgress: false,
        loginState: 'idle',
      })).toBe(true)
    }
  })

  it('does not cover diagnostic routes with the login overlay', () => {
    expect(shouldRenderLoginOverlay('/debug/message-blocks')).toBe(false)
    expect(shouldRenderLoginOverlay('/test/solid-ui-react')).toBe(false)
    expect(shouldRenderLoginOverlay('/chat')).toBe(true)
  })
})
