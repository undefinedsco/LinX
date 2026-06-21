export const LINX_RUNTIME_MANAGED_AUTH_KEY = 'linx-runtime-managed-auth'

export function isLinxRuntimeManagedAuthKey(value: string | undefined): boolean {
  return value?.trim() === LINX_RUNTIME_MANAGED_AUTH_KEY
}
