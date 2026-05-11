import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEmbeddedAuthorizationState } from './use-embedded-authorization-state'

const getEmbeddedAuthorizationStateMock = vi.fn()
const onEmbeddedAuthorizationStateMock = vi.fn()

function TestComponent() {
  const { open, reason, ready } = useEmbeddedAuthorizationState()
  return <div>{open ? `open:${reason}:${ready ? 'ready' : 'loading'}` : `closed:${reason}`}</div>
}

describe('useEmbeddedAuthorizationState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getEmbeddedAuthorizationStateMock.mockResolvedValue({ open: true, reason: 'opened', ready: false })
    onEmbeddedAuthorizationStateMock.mockImplementation(() => () => {})

    window.xpodDesktop = {
      auth: {
        getEmbeddedAuthorizationState: getEmbeddedAuthorizationStateMock,
        onEmbeddedAuthorizationState: onEmbeddedAuthorizationStateMock,
        closeEmbeddedAuthorization: vi.fn(),
      },
    } as any
  })

  afterEach(() => {
    delete window.xpodDesktop
  })

  it('hydrates current embedded authorization state before events arrive', async () => {
    render(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByText('open:opened:loading')).toBeTruthy()
    })

    expect(getEmbeddedAuthorizationStateMock).toHaveBeenCalledTimes(1)
    expect(onEmbeddedAuthorizationStateMock).toHaveBeenCalledTimes(1)
  })
})
