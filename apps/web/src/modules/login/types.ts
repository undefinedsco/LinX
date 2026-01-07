import type { SolidLoginMode, SolidAccountPreview, CustomIssuerDraft } from '@linx/stores/login'

export type { SolidLoginMode, SolidAccountPreview, CustomIssuerDraft } from '@linx/stores/login'

export interface SolidIssuerOption {
  id: string
  url: string
  label: string
  domain: string
  description?: string
  isDefault?: boolean
  isRecent?: boolean
  logoUrl?: string
  isCustom?: boolean
}

export interface StoredIssuer {
  url: string
  label?: string
  logoUrl?: string
  updatedAt: string
}

export interface SolidLoginModalProps {
  mode: SolidLoginMode
  account?: SolidAccountPreview
  issuers: SolidIssuerOption[]
  selectedIssuer?: string
  customIssuer: CustomIssuerDraft
  errorMessage?: string | null
  disablePrimary?: boolean
  onEnter: () => void
  onSwitchAccount: () => void
  onCancel: () => void
  onClose: () => void
  onOpenSettings: () => void
  onSelectIssuer: (url: string) => void
  onCustomIssuerChange: (value: string) => void
  onSaveCustomIssuer: () => void
}

export interface IssuerPickerProps {
  issuers: SolidIssuerOption[]
  selectedIssuer?: string
  customIssuer: CustomIssuerDraft
  onSelectIssuer: (url: string) => void
  onCustomIssuerChange: (value: string) => void
  onSaveCustomIssuer: () => void
}
