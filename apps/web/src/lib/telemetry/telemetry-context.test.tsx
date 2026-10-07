import { render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelemetryProvider } from './telemetry-provider'
import { useTelemetry } from './use-telemetry'

function TrackOnce() {
  const { track } = useTelemetry()
  useEffect(() => {
    track('message_send', {
      content: 'diagnostic payload should not be printed',
    })
  }, [track])
  return null
}

describe('TelemetryProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps telemetry payloads out of the normal browser console', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})

    render(
      <TelemetryProvider>
        <TrackOnce />
      </TelemetryProvider>,
    )

    expect(log).not.toHaveBeenCalled()
    expect(debug).not.toHaveBeenCalled()
  })
})
