import type { LoginState, StoredAccount, ProviderOption } from '@linx/stores/login'

export type { LoginState, StoredAccount, ProviderOption }

export interface LocalServiceStatus {
  running: boolean
  url?: string
  label?: string
}

export interface LoginModalProps {
  state: LoginState
  error: string | null
  failedProvider: string | null
  selectedProvider: string | null
  storedAccount: StoredAccount | null
  providers: ProviderOption[]
  isConnecting: boolean
  localService: LocalServiceStatus | null
  isLaunching: boolean
  onConnect: (providerUrl: string) => void
  onAddProvider: (url: string, label?: string) => void
  onDeleteProvider: (url: string) => void
  onLaunchLocalService: () => void
  onSignOut: () => void
  onClearError: () => void
}
