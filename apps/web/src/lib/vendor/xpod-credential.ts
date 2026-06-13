import { credentialResource } from '@undefineds.co/models'

export const Credential = credentialResource

export const CredentialStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ERROR: 'error',
} as const

export const ServiceType = {
  AI: 'ai',
} as const

export type CredentialStatusValue = typeof CredentialStatus[keyof typeof CredentialStatus]
export type ServiceTypeValue = typeof ServiceType[keyof typeof ServiceType]
