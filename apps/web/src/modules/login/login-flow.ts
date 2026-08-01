import type { LocalOnboardingSnapshot } from '@/types/electron-api'
import type { ConnectingProviderInfo, LocalLoginProviderSource } from './types'
import type { StorageConflict } from './storage-reconciliation'
import type { LoginState } from '@linx/stores/login'

export type LoginFlowView = 'default' | 'local'

export type LoginErrorScope =
  | 'global'
  | 'local-start'
  | 'auth-surface'
  | 'auth-callback'
  | 'storage'
  | 'connectivity'

export interface ScopedLoginError {
  scope: LoginErrorScope
  message: string
}

export interface LoginFlowState {
  phase: LoginState
  view: LoginFlowView
  localProviderSource: LocalLoginProviderSource
  localLoginActive: boolean
  storageConflict: StorageConflict | null
  connectingProvider: ConnectingProviderInfo | null
  error: ScopedLoginError | null
}

export type LoginFlowAction =
  | { type: 'set-phase'; phase: LoginState }
  | { type: 'set-view'; view: LoginFlowView }
  | { type: 'set-local-provider-source'; source: LocalLoginProviderSource }
  | { type: 'set-local-login-active'; active: boolean }
  | { type: 'set-storage-conflict'; conflict: StorageConflict | null }
  | { type: 'set-connecting-provider'; provider: ConnectingProviderInfo | null }
  | { type: 'set-error'; scope: LoginErrorScope; message: string }
  | { type: 'clear-error' }
  | { type: 'reset-default' }

export function createInitialLoginFlowState(phase: LoginState = 'restoring'): LoginFlowState {
  return {
    phase,
    view: 'default',
    localProviderSource: 'local',
    localLoginActive: false,
    storageConflict: null,
    connectingProvider: null,
    error: null,
  }
}

export function loginFlowReducer(
  state: LoginFlowState,
  action: LoginFlowAction,
): LoginFlowState {
  switch (action.type) {
    case 'set-phase':
      return state.phase === action.phase ? state : { ...state, phase: action.phase }
    case 'set-view':
      return state.view === action.view ? state : { ...state, view: action.view }
    case 'set-local-provider-source':
      return state.localProviderSource === action.source
        ? state
        : { ...state, localProviderSource: action.source }
    case 'set-local-login-active':
      return state.localLoginActive === action.active
        ? state
        : { ...state, localLoginActive: action.active }
    case 'set-storage-conflict':
      return state.storageConflict === action.conflict
        ? state
        : { ...state, storageConflict: action.conflict }
    case 'set-connecting-provider':
      return state.connectingProvider === action.provider
        ? state
        : { ...state, connectingProvider: action.provider }
    case 'set-error':
      if (state.error?.scope === action.scope && state.error.message === action.message) {
        return state
      }
      return { ...state, error: { scope: action.scope, message: action.message } }
    case 'clear-error':
      return state.error ? { ...state, error: null } : state
    case 'reset-default':
      return {
        ...state,
        phase: 'idle',
        view: 'default',
        localProviderSource: 'local',
        localLoginActive: false,
        storageConflict: null,
        connectingProvider: null,
        error: null,
      }
    default:
      return state
  }
}

export function selectLoginFlowVisibleError(input: {
  flow: LoginFlowState
  storeError: string | null
  localOnboarding: LocalOnboardingSnapshot | null
}): string | null {
  const scopedError = input.flow.error
  return scopedError?.message ?? input.storeError
}
