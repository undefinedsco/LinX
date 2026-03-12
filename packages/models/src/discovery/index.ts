/**
 * Discovery Service
 * 
 * 提供 AI 供应商、模型等元数据的发现服务
 * 支持内置数据 + 远程 API 获取（有 Key 时）
 */

export * from './types'

import type { 
  ProviderMetadata, 
  ModelMetadata, 
  DiscoveryService
} from './types'

// 导入内置数据
import providersData from './providers.json'
import modelsData from './models.json'

// ============================================================================
// Builtin Data (内置数据)
// ============================================================================

const builtinProviders: ProviderMetadata[] = providersData.providers as ProviderMetadata[]
const builtinModels: ModelMetadata[] = modelsData.models as ModelMetadata[]

// ============================================================================
// Discovery Service Implementation
// ============================================================================

class BuiltinDiscoveryService implements DiscoveryService {
  
  // -------------------------------------------------------------------------
  // Providers
  // -------------------------------------------------------------------------
  
  async getProviders(): Promise<ProviderMetadata[]> {
    return builtinProviders
  }
  
  async getProvider(slug: string): Promise<ProviderMetadata | undefined> {
    return builtinProviders.find(p => p.slug === slug)
  }
  
  // -------------------------------------------------------------------------
  // Models
  // -------------------------------------------------------------------------
  
  async getModels(provider?: string): Promise<ModelMetadata[]> {
    if (provider) {
      return builtinModels.filter(m => m.provider === provider)
    }
    return builtinModels
  }
  
  async getModel(provider: string, modelId: string): Promise<ModelMetadata | undefined> {
    return builtinModels.find(m => m.provider === provider && m.id === modelId)
  }
  
  async getDefaultModel(provider: string): Promise<ModelMetadata | undefined> {
    const providerModels = builtinModels.filter(m => m.provider === provider)
    return providerModels.find(m => m.isDefault) || providerModels[0]
  }
}

// ============================================================================
// Smart Discovery Service (with API fallback)
// ============================================================================

export interface SmartDiscoveryOptions {
  getApiKey?: (provider: string) => Promise<string | null>
  fetchModelsFromApi?: (provider: string, apiKey: string, baseUrl: string) => Promise<ModelMetadata[]>
}

class SmartDiscoveryService implements DiscoveryService {
  private builtin = new BuiltinDiscoveryService()
  private options: SmartDiscoveryOptions
  private modelCache = new Map<string, { models: ModelMetadata[], timestamp: number }>()
  private cacheTTL = 5 * 60 * 1000 // 5 minutes
  
  constructor(options: SmartDiscoveryOptions = {}) {
    this.options = options
  }
  
  async getProviders(): Promise<ProviderMetadata[]> {
    return this.builtin.getProviders()
  }
  
  async getProvider(slug: string): Promise<ProviderMetadata | undefined> {
    return this.builtin.getProvider(slug)
  }
  
  async getModels(provider?: string): Promise<ModelMetadata[]> {
    if (!provider) {
      return this.builtin.getModels()
    }
    
    // 检查缓存
    const cached = this.modelCache.get(provider)
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.models
    }
    
    // 尝试从 API 获取（如果有 Key）
    if (this.options.getApiKey && this.options.fetchModelsFromApi) {
      try {
        const apiKey = await this.options.getApiKey(provider)
        if (apiKey) {
          const providerMeta = await this.builtin.getProvider(provider)
          if (providerMeta) {
            const models = await this.options.fetchModelsFromApi(provider, apiKey, providerMeta.baseUrl)
            if (models.length > 0) {
              this.modelCache.set(provider, { models, timestamp: Date.now() })
              return models
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch models from API for ${provider}, falling back to builtin`, error)
      }
    }
    
    // Fallback 到内置列表
    return this.builtin.getModels(provider)
  }
  
  async getModel(provider: string, modelId: string): Promise<ModelMetadata | undefined> {
    const models = await this.getModels(provider)
    return models.find(m => m.id === modelId)
  }
  
  async getDefaultModel(provider: string): Promise<ModelMetadata | undefined> {
    const models = await this.getModels(provider)
    return models.find(m => m.isDefault) || models[0]
  }
  
  clearCache(provider?: string) {
    if (provider) {
      this.modelCache.delete(provider)
    } else {
      this.modelCache.clear()
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

// 单例实例
export const builtinDiscovery = new BuiltinDiscoveryService()

// 创建 Smart Discovery 实例的工厂函数
export function createDiscoveryService(options?: SmartDiscoveryOptions): DiscoveryService {
  return new SmartDiscoveryService(options)
}

// 便捷方法：直接获取内置数据
export const getBuiltinProviders = () => builtinProviders
export const getBuiltinModels = (provider?: string) => 
  provider ? builtinModels.filter(m => m.provider === provider) : builtinModels
export const getBuiltinProvider = (slug: string) => builtinProviders.find(p => p.slug === slug)
export const getBuiltinModel = (provider: string, modelId: string) => 
  builtinModels.find(m => m.provider === provider && m.id === modelId)
export const getBuiltinDefaultModel = (provider: string) => {
  const providerModels = builtinModels.filter(m => m.provider === provider)
  return providerModels.find(m => m.isDefault) || providerModels[0]
}

// 导出内置数据版本信息
export const DISCOVERY_VERSION = {
  providers: providersData.version,
  models: modelsData.version,
  updatedAt: providersData.updatedAt,
}
