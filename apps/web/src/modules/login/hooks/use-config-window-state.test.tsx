import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConfigWindowState } from './use-config-window-state'

const getConfigWindowStateMock = vi.fn()
const onConfigWindowStateMock = vi.fn()

function TestComponent() {
  const { open, ready } = useConfigWindowState()
  return <div>{open ? `open:${ready ? 'ready' : 'loading'}` : 'closed'}</div>
}

describe('useConfigWindowState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConfigWindowStateMock.mockResolvedValue({ open: true, reason: 'opened', ready: false })
    onConfigWindowStateMock.mockImplementation(() => () => {})

    window.xpodDesktop = {
      app: {
        getConfigWindowState: getConfigWindowStateMock,
        onConfigWindowState: onConfigWindowStateMock,
      },
    } as any
  })

  afterEach(() => {
    delete window.xpodDesktop
  })

  it('hydrates current config window state before events arrive', async () => {
    render(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByText('open:loading')).toBeTruthy()
    })

    expect(getConfigWindowStateMock).toHaveBeenCalledTimes(1)
    expect(onConfigWindowStateMock).toHaveBeenCalledTimes(1)
  })
})
