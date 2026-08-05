import type { AIConfigModel, AIConfigProviderState } from '@undefineds.co/models'
import { type ProviderDef } from './provider-catalog'

export interface AIProvider extends ProviderDef, AIConfigProviderState {}

export type AIModel = AIConfigModel
