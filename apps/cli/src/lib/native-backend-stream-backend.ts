import type { AutoModeNormalizedEvent } from './auto-mode/types.js'

export interface NativeBackendStreamProxy {
  sendTurn(input: string): Promise<void>
  subscribe(listener: (event: AutoModeNormalizedEvent) => void): () => void
}

export function createNativeBackendStreamBackend(
  proxy: NativeBackendStreamProxy | null | undefined,
): NativeBackendStreamProxy | undefined {
  if (!proxy) {
    return undefined
  }

  const sendTurn = proxy.sendTurn

  return {
    sendTurn(input) {
      return sendTurn.call(proxy, input)
    },
    subscribe(listener) {
      return proxy.subscribe(listener)
    },
  }
}
