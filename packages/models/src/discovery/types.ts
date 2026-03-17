/**
 * Discovery Service Types
 * 
 * 可扩展的发现服务体系，用于提供：
 * - Providers (AI 供应商)
 * - Models (模型列表)
 * - Tools (工具/插件)
 * - Agents (预设 Agent 模板)
 * - Prompts (提示词模板)
 * - 未来更多...
 */

// ============================================================================
// Provider (供应商)
// ============================================================================

export interface ProviderMetadata {
  slug: string
  displayName: string
  baseUrl: string
  homepage: string
  logoUrl?: string
  description?: string
  supportedFeatures?: ProviderFeature[]
  authType?: 'bearer' | 'x-api-key' | 'query-param' | 'none'
}

export type ProviderFeature = 'chat' | 'embedding' | 'image' | 'audio' | 'vision' | 'function-calling'

// ============================================================================
// Model (模型)
// ============================================================================

export interface ModelMetadata {
  id: string
  provider: string  // 关联 provider.slug
  displayName: string
  description?: string
  contextLength?: number
  maxOutputTokens?: number
  pricing?: ModelPricing
  capabilities?: ModelCapability[]
  isDefault?: boolean  // 该供应商的默认推荐模型
}

export interface ModelPricing {
  input: number   // USD per 1M tokens
  output: number  // USD per 1M tokens
  currency?: string
}

export type ModelCapability = 'chat' | 'vision' | 'function-calling' | 'streaming' | 'json-mode'

// ============================================================================
// Tool (工具/插件)
// ============================================================================

export interface ToolMetadata {
  id: string
  name: string
  displayName: string
  description: string
  category?: string
  schema: ToolSchema
  enabled?: boolean
}

export interface ToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>  // JSON Schema
  }
}

// ============================================================================
// Agent Template (预设 Agent)
// ============================================================================

export interface AgentTemplate {
  id: string
  name: string
  displayName: string
  description: string
  icon?: string
  provider: string
  model: string
  systemPrompt: string
  tools?: string[]  // tool ids
  tags?: string[]
}

// ============================================================================
// Prompt Template (提示词模板)
// ============================================================================

export interface PromptTemplate {
  id: string
  name: string
  displayName: string
  description: string
  category?: string
  content: string
  variables?: PromptVariable[]
  tags?: string[]
}

export interface PromptVariable {
  name: string
  description?: string
  defaultValue?: string
  required?: boolean
}

// ============================================================================
// Discovery Registry (完整注册表)
// ============================================================================

export interface DiscoveryRegistry {
  version: string
  updatedAt: string
  providers: ProviderMetadata[]
  models: ModelMetadata[]
  tools?: ToolMetadata[]
  agents?: AgentTemplate[]
  prompts?: PromptTemplate[]
}

// ============================================================================
// Discovery Service Interface
// ============================================================================

export interface DiscoveryService {
  // Providers
  getProviders(): Promise<ProviderMetadata[]>
  getProvider(slug: string): Promise<ProviderMetadata | undefined>
  
  // Models
  getModels(provider?: string): Promise<ModelMetadata[]>
  getModel(provider: string, modelId: string): Promise<ModelMetadata | undefined>
  getDefaultModel(provider: string): Promise<ModelMetadata | undefined>
  
  // Tools (future)
  getTools?(): Promise<ToolMetadata[]>
  
  // Agents (future)
  getAgentTemplates?(): Promise<AgentTemplate[]>
  
  // Prompts (future)
  getPromptTemplates?(): Promise<PromptTemplate[]>
}
