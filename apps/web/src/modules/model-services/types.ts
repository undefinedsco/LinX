import type { AIConfigModel, AIConfigProviderState } from '@linx/models'
import { type ProviderDef } from './constants'

export interface AIProvider extends ProviderDef, AIConfigProviderState {}

export type AIModel = AIConfigModel
