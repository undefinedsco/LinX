import type { AIConfigModel, AIConfigProviderState } from '@undefineds.co/models'

export interface AIProvider extends AIConfigProviderState {
  name: string
  description?: string
  defaultModels?: string[]
  /**
   * Deployment-owned, read-only model service advertised by the server. It is
   * not a personal provider: no credentials, no edit/key actions, no CRUD.
   */
  builtin?: boolean
  readOnly?: boolean
}

export type AIModel = AIConfigModel
