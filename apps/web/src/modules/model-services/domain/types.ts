import type { AIConfigModel, AIConfigProviderState } from '@undefineds.co/models'

export interface AIProvider extends AIConfigProviderState {
  name: string
  description?: string
  defaultModels?: string[]
}

export type AIModel = AIConfigModel
