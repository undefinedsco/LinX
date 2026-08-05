import type { AIModel, AIProvider } from './types'

export interface ModelProviderListProjection {
  id: string
  name: string
  enabled: boolean
}

export interface ModelListProjection {
  id: string
  name: string
  capabilities: string[]
}

export function projectModelProviderList(
  providers: Record<string, AIProvider>,
  search: string,
): ModelProviderListProjection[] {
  const normalizedSearch = search.trim().toLowerCase()
  return Object.values(providers)
    .filter((provider) => !normalizedSearch || provider.name.toLowerCase().includes(normalizedSearch))
    .map(({ id, name, enabled }) => ({ id, name, enabled }))
}

export function projectModelList(models: AIModel[], search: string): ModelListProjection[] {
  const normalizedSearch = search.trim().toLowerCase()
  return models
    .filter((model) => (
      !normalizedSearch
      || model.name.toLowerCase().includes(normalizedSearch)
      || model.id.toLowerCase().includes(normalizedSearch)
    ))
    .map((model) => ({
      id: model.id,
      name: model.name,
      capabilities: inferModelCapabilities(model.id, model.capabilities),
    }))
}

export function inferModelCapabilities(modelId: string, explicitCapabilities: string[] = []): string[] {
  if (explicitCapabilities.length > 0) return explicitCapabilities

  const capabilities = new Set<string>()
  const normalizedId = modelId.toLowerCase()
  if (/vision|4o|claude-3|gemini-1\.5|llava/.test(normalizedId)) capabilities.add('vision')
  if (/gpt-4|turbo|claude|tool|deepseek|mistral/.test(normalizedId)) capabilities.add('function_calling')
  if (/online|search|sonar|net/.test(normalizedId)) capabilities.add('web')
  return [...capabilities]
}
