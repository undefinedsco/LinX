import type { Api } from '@earendil-works/pi-ai'
import {
  DEFAULT_LINX_CLOUD_MODEL_ID,
  FALLBACK_LINX_CLOUD_MODEL_IDS,
} from './default-model.js'

export const LINX_CLOUD_PROVIDER_ID = 'undefineds'
export const LINX_CLOUD_PROVIDER_LABEL = 'LinX Cloud'
export const LINX_CLOUD_PROVIDER_API = 'linx-cloud-chat-completions'
export const DEFAULT_LINX_CLOUD_CONTEXT_WINDOW = 1_000_000

export interface LinxCloudDefaultModelSettings {
  getDefaultProvider(): string | undefined
  getDefaultModel(): string | undefined
  setDefaultModelAndProvider(provider: string, model: string): void
}

export function sanitizeLinxCloudDefaults(
  settingsManager: LinxCloudDefaultModelSettings,
  requestedModel: string | undefined,
  providerModels: Array<{ id: string }>,
): string {
  const availableModelIds = new Set(providerModels.map((model) => model.id))
  const savedProvider = settingsManager.getDefaultProvider()
  const savedModel = settingsManager.getDefaultModel()
  const savedLinxModel = savedProvider === LINX_CLOUD_PROVIDER_ID && savedModel && availableModelIds.has(savedModel)
    ? savedModel
    : undefined
  const nextModel = requestedModel || savedLinxModel || DEFAULT_LINX_CLOUD_MODEL_ID

  if (savedProvider !== LINX_CLOUD_PROVIDER_ID || savedModel !== nextModel) {
    settingsManager.setDefaultModelAndProvider(LINX_CLOUD_PROVIDER_ID, nextModel)
  }

  return nextModel
}

export function buildLinxCloudProviderModel(input: {
  id: string
  contextWindow: number
}): {
  id: string
  name: string
  api: Api
  reasoning: boolean
  thinkingLevelMap: {
    xhigh: 'xhigh'
  }
  input: ['text']
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
  contextWindow: number
  maxTokens: number
  compat: {
    supportsStore: false
    supportsDeveloperRole: false
    supportsStrictMode: false
  }
} {
  return {
    id: input.id,
    name: input.id,
    api: LINX_CLOUD_PROVIDER_API,
    reasoning: true,
    thinkingLevelMap: {
      xhigh: 'xhigh',
    },
    input: ['text'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: input.contextWindow,
    maxTokens: 64_000,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsStrictMode: false,
    },
  }
}

export function buildFallbackLinxCloudProviderModels(activeModelId: string): ReturnType<typeof buildLinxCloudProviderModel>[] {
  return mergeLinxCloudProviderModels([], activeModelId).map((entry) => buildLinxCloudProviderModel(entry))
}

export function mergeLinxCloudProviderModels(
  models: Array<{ id: string; contextWindow?: number }>,
  activeModelId: string,
): Array<{ id: string; contextWindow: number }> {
  const byId = new Map<string, { id: string; contextWindow: number }>()
  for (const id of [
    ...FALLBACK_LINX_CLOUD_MODEL_IDS,
    activeModelId,
  ]) {
    byId.set(id, {
      id,
      contextWindow: normalizeLinxCloudContextWindow(undefined),
    })
  }
  for (const model of models) {
    const id = model.id.trim()
    if (!id) {
      continue
    }
    byId.set(id, {
      id,
      contextWindow: normalizeLinxCloudContextWindow(model.contextWindow),
    })
  }
  return [...byId.values()]
}

export function normalizeLinxCloudContextWindow(contextWindow: number | undefined): number {
  return typeof contextWindow === 'number' && Number.isFinite(contextWindow) && contextWindow > 0
    ? contextWindow
    : DEFAULT_LINX_CLOUD_CONTEXT_WINDOW
}
