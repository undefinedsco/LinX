import type { AutoModeNormalizedEvent } from './auto-mode/types.js'
import type { BackendCommandResult, BackendCommandRouter } from './backend-command.js'
import type { SessionControlManager } from './session-control.js'

export interface NativeBackendCommandProxy {
  readonly record: {
    readonly backend: string
  }
  executeCommand?(input: string): Promise<BackendCommandResult>
  setCwd?(cwd: string): Promise<void> | void
  subscribe(listener: (event: AutoModeNormalizedEvent) => void): () => void
  setSessionControl?(control: SessionControlManager): void
}

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
