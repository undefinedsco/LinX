interface ApiKey {
  id: string
  name: string
  provider: string
  key: string
  baseUrl?: string
  model?: string
  lastUsed?: Date
  isValid: boolean
  isCustom: boolean
}

interface ApiKeyManager {
  getKey: (provider: string) => ApiKey | null
  getAllKeys: () => ApiKey[]
  hasKey: (provider: string) => boolean
}

declare global {
  interface Window {
    apiKeyManager?: ApiKeyManager
  }
}

export {};