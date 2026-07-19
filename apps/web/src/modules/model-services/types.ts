import type { AIConfigModel, AIConfigProviderState } from '@undefineds.co/models'
import { type ProviderDef } from './constants'

export type ModelServiceVerificationStatus = 'unverified' | 'available' | 'failed'

export interface AIProvider extends ProviderDef, AIConfigProviderState {
  verificationStatus: ModelServiceVerificationStatus
}

export type AIModel = AIConfigModel
