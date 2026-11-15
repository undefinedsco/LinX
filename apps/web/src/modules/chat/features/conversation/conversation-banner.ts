export type ConversationBannerKind =
  | 'service-access'
  | 'matrix-authorization'
  | 'offline'
  | 'load-error'
  | 'reconnect'

export interface ConversationBannerState {
  serviceAccessRequired: boolean
  matrixAuthorizationRequired: boolean
  online: boolean
  loadError: boolean
  reconnectStatus: 'idle' | 'syncing' | 'error'
}

/** The banners share one slot; the one that needs the user's action wins. */
export function selectConversationBanner(state: ConversationBannerState): ConversationBannerKind | null {
  if (state.serviceAccessRequired) return 'service-access'
  if (state.matrixAuthorizationRequired) return 'matrix-authorization'
  if (!state.online) return 'offline'
  if (state.loadError) return 'load-error'
  if (state.reconnectStatus !== 'idle') return 'reconnect'
  return null
}
