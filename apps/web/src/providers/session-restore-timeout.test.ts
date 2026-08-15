import { describe, expect, it, vi } from 'vitest'
import {
  SessionRestoreTimeoutError,
  waitForSessionRestore,
} from './session-restore-timeout'

describe('waitForSessionRestore', () => {
  it('returns the restored session result', async () => {
    await expect(waitForSessionRestore(Promise.resolve('restored'), 100)).resolves.toBe('restored')
  })

  it('rejects a restore request that never settles', async () => {
    vi.useFakeTimers()

    const restore = waitForSessionRestore(new Promise<never>(() => undefined), 100)
    const assertion = expect(restore).rejects.toBeInstanceOf(SessionRestoreTimeoutError)

    await vi.advanceTimersByTimeAsync(100)
    await assertion

    vi.useRealTimers()
  })
})
