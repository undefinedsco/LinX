import type { AutoModeWorkerBackend } from './auto-mode/types.js'

export const DEFAULT_LINX_RUNTIME_BACKEND_MODE = 'cloud'
export const DEFAULT_LINX_NATIVE_WORKER_BACKEND: AutoModeWorkerBackend = 'codex'
export const DEFAULT_LINX_CLOUD_RUNTIME_URL = 'https://api.undefineds.co/v1'

export type LinxRuntimeBackendMode = 'cloud' | 'native'

export function resolveLinxRuntimeAdapterCwd(cwd?: string): string {
  return typeof cwd === 'string' && cwd.trim() ? cwd : process.cwd()
}

export function resolveLinxRuntimeBackendMode(backend?: LinxRuntimeBackendMode): LinxRuntimeBackendMode {
  return backend ?? DEFAULT_LINX_RUNTIME_BACKEND_MODE
}

export function resolveLinxRuntimeWorkerBackend(input: {
  backendMode: LinxRuntimeBackendMode
  workerBackend?: AutoModeWorkerBackend
}): AutoModeWorkerBackend | undefined {
  return input.workerBackend ?? (input.backendMode === 'native' ? DEFAULT_LINX_NATIVE_WORKER_BACKEND : undefined)
}

export function resolveLinxRuntimeBaseUrl(baseUrl?: string): string {
  return typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl : DEFAULT_LINX_CLOUD_RUNTIME_URL
}
