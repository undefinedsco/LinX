import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { SolidSessionContextValue } from './solid-session-context'
import { SessionContext, useSession } from './solid-session-context'

describe('solid session context', () => {
  it('exposes the authn-browser session without a solid-ui-react adapter', () => {
    const value = {
      session: { info: { isLoggedIn: true, webId: 'https://pod.example/profile/card#me' } },
      login: vi.fn(),
      logout: vi.fn(),
      sessionRequestInProgress: false,
      setSessionRequestInProgress: vi.fn(),
      fetch: vi.fn(),
      profile: undefined,
    } as unknown as SolidSessionContextValue
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
    )

    const { result } = renderHook(() => useSession(), { wrapper })

    expect(result.current).toBe(value)
  })

  it('fails clearly when a consumer is outside the provider', () => {
    expect(() => renderHook(() => useSession())).toThrow(
      'useSession must be used inside SolidSessionProvider',
    )
  })
})
