import { type ProviderDef } from './constants'

// 领域模型：AI Provider (聚合根)
// 继承自静态配置 ProviderDef，但增加了用户可配置的状态
export interface AIProvider extends ProviderDef {
  // 用户配置状态 (State)
  enabled: boolean
  apiKey?: string
  baseUrl?: string // 用户覆盖的 Base URL
  
  // 子实体：模型列表 (Value Objects)
  // 用户可能会添加自定义模型，或者覆盖默认模型的配置
  models: AIModel[]
  
  // 元数据
  updatedAt?: number
}

export interface AIModel {
  id: string // 模型 ID (e.g. 'gpt-4')
  name: string // 显示名称
  enabled: boolean // 是否在聊天选择器中显示
  capabilities?: string[] // 'vision', 'function_calling' 等
  isCustom?: boolean // 是否是用户手动添加的
}
