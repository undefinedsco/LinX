import type { NativeBackendProxy } from './native-backend-proxy.js'

export type NativeBackendStreamProxy = Pick<NativeBackendProxy, 'sendTurn' | 'subscribe'>

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
