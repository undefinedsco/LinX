import { createLinxAgentStreamAdapter } from './stream.js'
import type { LinxRuntimeAdapterDependencies } from '../linx-runtime-adapter-dependencies.js'
import {
  createLinxAgentSessionRuntime,
} from '../linx-runtime-agent-session.js'
import {
  createRuntimeBackendComposition,
} from '../linx-runtime-backend-composition.js'
import type {
  LinxRuntimeAdapter,
  LinxRuntimeAdapterOptions,
  LinxRuntimeFactoryContext,
} from '../linx-runtime-adapter-contract.js'

export function createLinxRuntimeAdapter(
  dependencies: LinxRuntimeAdapterDependencies,
  options: LinxRuntimeAdapterOptions = {},
): LinxRuntimeAdapter {
  const runtime = createRuntimeBackendComposition(dependencies, options)
  const streamAdapter = createLinxAgentStreamAdapter({
    sessionId: runtime.sessionId,
    cwd: runtime.cwd,
    model: runtime.model,
    backend: runtime.streamBackend,
    completionBackend: runtime.completionBackend,
  })

  return {
    remoteUrl: runtime.remoteUrl,
    sessionId: runtime.sessionId,
    cwd: runtime.cwd,
    model: runtime.model,
    backend: 'linx',
    runtimeBackend: runtime.workerBackend,
    autoEnabled: runtime.autoEnabled,
    symphonyEnabled: runtime.symphonyEnabled,
    backendCommandRouter: runtime.commandRouter,
    streamAdapter,
    createRuntime: async (context: LinxRuntimeFactoryContext) => createLinxAgentSessionRuntime({
      context,
      baseUrl: runtime.baseUrl,
      requestedModel: runtime.requestedModel,
      streamSimple: streamAdapter.streamFn,
      cloudRuntime: runtime.cloudRuntime,
      issuerUrl: runtime.issuerUrl,
      oauth: runtime.oauth,
      getPodDataSession: runtime.getPodDataSession,
      workerBackend: runtime.workerBackend,
      backendCommandRouter: runtime.commandRouter,
      backendSessionRef: runtime.backendSessionRef,
      autoEnabled: runtime.autoEnabled,
      symphonyEnabled: runtime.symphonyEnabled,
    }),
    start: () => runtime.start(),
    close: () => runtime.close(),
  }
}
