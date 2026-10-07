export const SESSION_RESTORE_TIMEOUT_MS = 15_000

export class SessionRestoreTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Session restore did not finish within ${timeoutMs} ms.`)
    this.name = 'SessionRestoreTimeoutError'
  }
}

export async function waitForSessionRestore<T>(
  restore: Promise<T>,
  timeoutMs = SESSION_RESTORE_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      restore,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new SessionRestoreTimeoutError(timeoutMs)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}
