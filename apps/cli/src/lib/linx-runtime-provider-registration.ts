import { AuthStorage, ModelRegistry, SettingsManager } from '@earendil-works/pi-coding-agent'
import type { Api, Model, OAuthCredentials } from '@earendil-works/pi-ai'
import {
  LINX_CLOUD_PROVIDER_API,
  LINX_CLOUD_PROVIDER_ID,
  sanitizeLinxCloudDefaults,
} from './linx-cloud-models.js'
import { LINX_RUNTIME_MANAGED_AUTH_KEY } from './linx-runtime-auth.js'

export type LinxRuntimeCloudProviderRegistration = {
  defaultModelId: string
}

type LinxRuntimeProviderModelDefinitions = NonNullable<Parameters<ModelRegistry['registerProvider']>[1]['models']>

export function createLinxRuntimeProviderRegistration(input: {
  authStorage: AuthStorage
  modelRegistry: ModelRegistry
  settingsManager: SettingsManager
  baseUrl: string
  requestedModel?: string
  streamSimple: unknown
  providerModels: LinxRuntimeProviderModelDefinitions
  oauth: {
    name: string
    login(...args: unknown[]): Promise<OAuthCredentials>
    refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>
    getApiKey(credentials: OAuthCredentials): string
    modifyModels?(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[]
  }
  explicitOAuthCredential?: OAuthCredentials | null
  useManagedRuntimeAuth?: boolean
}): LinxRuntimeCloudProviderRegistration {
  disableLinxProviderOAuthDetection(input.modelRegistry)
  input.modelRegistry.registerProvider(LINX_CLOUD_PROVIDER_ID, {
    api: LINX_CLOUD_PROVIDER_API,
    baseUrl: input.baseUrl,
    apiKey: '$LINX_RUNTIME_AUTH',
    oauth: input.oauth,
    authHeader: false,
    streamSimple: input.streamSimple as never,
    models: input.providerModels,
  })

  if (input.useManagedRuntimeAuth !== false) {
    input.authStorage.setRuntimeApiKey(LINX_CLOUD_PROVIDER_ID, LINX_RUNTIME_MANAGED_AUTH_KEY)
  }
  if (input.explicitOAuthCredential) {
    input.authStorage.set(LINX_CLOUD_PROVIDER_ID, { type: 'oauth', ...input.explicitOAuthCredential })
  }

  return {
    defaultModelId: sanitizeLinxCloudDefaults(input.settingsManager, input.requestedModel, input.providerModels),
  }
}

function disableLinxProviderOAuthDetection(modelRegistry: ModelRegistry): void {
  const registry = modelRegistry as ModelRegistry & {
    __linxCloudOAuthDetectionPatched?: boolean
  }
  if (registry.__linxCloudOAuthDetectionPatched === true) {
    return
  }

  const originalIsUsingOAuth = modelRegistry.isUsingOAuth.bind(modelRegistry)
  modelRegistry.isUsingOAuth = (model) => (
    model.provider === LINX_CLOUD_PROVIDER_ID ? false : originalIsUsingOAuth(model)
  )
  registry.__linxCloudOAuthDetectionPatched = true
}
