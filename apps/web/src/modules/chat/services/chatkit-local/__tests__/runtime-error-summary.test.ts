import { describe, expect, it } from 'vitest'

import { summarizeRuntimeError } from '../service'

describe('summarizeRuntimeError', () => {
  it('prefers the nested upstream provider error', () => {
    const body = JSON.stringify({
      error: {
        code: 'provider_error',
        message: 'Provider request failed with status 400',
        details: {
          body: JSON.stringify({
            error: {
              code: 'invalid_request',
              message: 'Unsupported message content',
            },
          }),
        },
      },
    })

    expect(summarizeRuntimeError(body)).toBe('invalid_request: Unsupported message content')
  })

  it('keeps non-JSON diagnostics bounded and single-line', () => {
    expect(summarizeRuntimeError(`failed\n${'x'.repeat(400)}`)).toBe(`failed ${'x'.repeat(193)}`)
  })
})
