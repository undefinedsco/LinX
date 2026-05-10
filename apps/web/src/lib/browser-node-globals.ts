export function installBrowserNodeGlobals(): void {
  if (typeof globalThis === 'undefined') {
    return
  }

  const target = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>
    }
  }

  if (typeof target.process === 'undefined') {
    Object.defineProperty(target, 'process', {
      configurable: true,
      writable: true,
      value: { env: {} },
    })
    return
  }

  if (!target.process || typeof target.process !== 'object') {
    return
  }

  if (!target.process.env || typeof target.process.env !== 'object') {
    target.process.env = {}
  }
}
