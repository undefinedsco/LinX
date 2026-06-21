import type { BackendCommandRouter } from './backend-command.js'
import type { NativeBackendProxy } from './native-backend-proxy.js'

export type NativeBackendCommandProxy = Pick<NativeBackendProxy, 'record' | 'executeCommand' | 'setCwd' | 'subscribe' | 'setSessionControl'>

export function createNativeBackendCommandRouter(
  proxy: NativeBackendCommandProxy | null | undefined,
): BackendCommandRouter | undefined {
  const executeCommand = proxy?.executeCommand
  if (!proxy || typeof executeCommand !== 'function') {
    return undefined
  }

  const setCwd = proxy.setCwd
  const setSessionControl = proxy.setSessionControl
  const router: BackendCommandRouter = {
    backend: proxy.record.backend,
    execute(input) {
      return executeCommand.call(proxy, input)
    },
    subscribe(listener) {
      return proxy.subscribe(listener)
    },
  }

  if (typeof setCwd === 'function') {
    router.setCwd = (nextCwd) => setCwd.call(proxy, nextCwd)
  }
  if (typeof setSessionControl === 'function') {
    router.setSessionControl = (control) => setSessionControl.call(proxy, control)
  }

  return router
}
