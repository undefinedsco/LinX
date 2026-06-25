import { createLinxRuntimeAdapter } from './lib/pi-adapter/runtime.js'
import type { CreateLinxCliRuntimeAdapter } from './lib/linx-pi-runtime-execution.js'

export const createDefaultLinxCliRuntimeAdapter: CreateLinxCliRuntimeAdapter = (options) => createLinxRuntimeAdapter({
  async createRemoteCompletion(completionOptions) {
    const chatApi = await import('./lib/chat-api.js')
    return chatApi.createRemoteCompletionResult(completionOptions)
  },
  async listRemoteModels(authFetch, runtimeUrl, listOptions) {
    const chatApi = await import('./lib/chat-api.js')
    return chatApi.listRemoteModels(authFetch, runtimeUrl, listOptions ?? { fallback: false, timeoutMs: 5000 })
  },
}, options)
