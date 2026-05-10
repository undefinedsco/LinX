import type { LoginState, StoredAccount, ProviderOption } from '@linx/stores/login'
import type { LocalOnboardingMode, LocalOnboardingSnapshot, LocalOnboardingState } from '@/types/electron-api'
import type { StorageConflict } from './storage-reconciliation'

export type { LoginState, StoredAccount, ProviderOption }

export interface LocalPodRuntime {
  kind: 'local-pod'
  providerId?: string
  status: 'running' | 'starting' | 'stopped' | 'error' | 'missing'
  canStart: boolean
  canCreate: boolean
  onboarding?: {
    state: LocalOnboardingState
    mode: LocalOnboardingMode | null
    message: string | null
  }
}

export interface LoginProviderOption extends ProviderOption {
  source: 'cloud' | 'custom' | 'local'
  runtime?: LocalPodRuntime
}

export interface LocalLoginStatus {
  active: boolean
  message: string | null
}

export interface AuthWindowStatus {
  open: boolean
  reason: 'opened' | 'completed' | 'dismissed'
  ready: boolean
}

export interface LoginModalProps {
  view: 'default' | 'local'
  state: LoginState
  error: string | null
  storedAccount: StoredAccount | null
  storageConflict: StorageConflict | null
  providers: LoginProviderOption[]
  localOnboarding: LocalOnboardingSnapshot | null
  onBackFromLocal: () => void
  onContinueLocalLogin: () => void
  onSwitchAccount: () => void
  onContinueStoredAccount: () => void
  onConnect: (providerUrl: string) => void
  onAddProvider: (url: string, label?: string) => void
  onClearError: () => void
  onDismissStorageConflict: () => void
  onOpenCurrentSpacePodSetup: () => void
  localLoginStatus: LocalLoginStatus
  authWindowStatus: AuthWindowStatus
}
