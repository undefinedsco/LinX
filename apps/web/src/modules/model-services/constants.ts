// Provider definitions (PNG first), with optional modelsApi for online listing
import type React from 'react'
import { Globe } from 'lucide-react'
import OpenAIImage from '@/assets/images/providers/openai.png'
import GoogleImage from '@/assets/images/providers/google.png'
import DeepSeekImage from '@/assets/images/providers/deepseek.png'
import OllamaImage from '@/assets/images/providers/ollama.png'
import MistralImage from '@/assets/images/providers/mistral.png'
import GroqImage from '@/assets/images/providers/groq.png'
import MoonshotImage from '@/assets/images/providers/moonshot.png'
import ZhiPuImage from '@/assets/images/providers/zhipu.png'

export interface ProviderDef {
  id: string
  name: string
  description?: string
  avatar?: string // PNG/JPG URL or local path
  icon?: React.ElementType
  homeUrl?: string
  docsUrl?: string
  apiKeyUrl?: string
  modelsUrl?: string
  modelsApi?: string
  defaultBaseUrl?: string
  defaultApiKeyPlaceholder?: string
  defaultModels?: string[]
}

export const MODEL_PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT 系列',
    avatar: OpenAIImage,
    homeUrl: 'https://openai.com/',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs',
    modelsUrl: 'https://platform.openai.com/docs/models',
    modelsApi: 'https://api.openai.com/v1/models',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultApiKeyPlaceholder: 'sk-...',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 系列',
    // Use console favicon for reliable red brand color
    avatar: 'https://console.anthropic.com/static/favicon-32x32.png',
    homeUrl: 'https://anthropic.com/',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com/en/docs',
    modelsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
    modelsApi: 'https://api.anthropic.com/v1/models',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultApiKeyPlaceholder: 'sk-ant-...',
    defaultModels: ['claude-3-5-sonnet-latest', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Gemini 系列',
    avatar: GoogleImage,
    homeUrl: 'https://gemini.google.com/',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    modelsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini',
    modelsApi: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultApiKeyPlaceholder: 'AIza...',
    defaultModels: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek Chat/Coder',
    avatar: DeepSeekImage,
    homeUrl: 'https://deepseek.com/',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://platform.deepseek.com/api-docs/',
    modelsUrl: 'https://platform.deepseek.com/api-docs/',
    modelsApi: 'https://api.deepseek.com/v1/models',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultApiKeyPlaceholder: 'sk-...',
    defaultModels: ['deepseek-chat', 'deepseek-coder'],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: '本地模型管理',
    avatar: OllamaImage,
    homeUrl: 'https://ollama.com/',
    docsUrl: 'https://github.com/ollama/ollama/tree/main/docs',
    modelsUrl: 'https://ollama.com/library',
    modelsApi: 'http://localhost:11434/api/tags',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultApiKeyPlaceholder: 'N/A (无需密钥)',
    defaultModels: ['llama3', 'mistral', 'qwen2'],
  },
  {
    id: 'x-ai',
    name: 'xAI',
    description: 'Grok 系列',
    avatar: 'https://x.ai/favicon.ico',
    homeUrl: 'https://x.ai/',
    docsUrl: 'https://docs.x.ai/docs',
    modelsUrl: 'https://docs.x.ai/docs/models',
    modelsApi: 'https://api.x.ai/v1/models',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultApiKeyPlaceholder: 'xai-...',
    defaultModels: ['grok-2', 'grok-beta'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: '多模型路由聚合',
    avatar: 'https://openrouter.ai/favicon.ico',
    icon: Globe,
    homeUrl: 'https://openrouter.ai/',
    apiKeyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
    modelsUrl: 'https://openrouter.ai/models',
    modelsApi: 'https://openrouter.ai/api/v1/models',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultApiKeyPlaceholder: 'sk-or-...',
    defaultModels: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax 系列',
    avatar: 'https://www.minimaxi.com/favicon.ico',
    icon: Globe,
    homeUrl: 'https://www.minimaxi.com',
    apiKeyUrl: 'https://www.minimaxi.com/usercenter/apikey',
    docsUrl: 'https://platform.minimaxi.com/document/knowledge/cd9f7e6aceaf05ef',
    modelsUrl: 'https://platform.minimaxi.com/document/knowledge/aw6gm53w2j25yttu',
    modelsApi: 'https://api.minimax.chat/v1/models',
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    defaultApiKeyPlaceholder: 'sk-...',
    defaultModels: ['abab6.5-chat', 'abab6.5s-chat'],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'Mistral 系列',
    avatar: MistralImage,
    homeUrl: 'https://mistral.ai',
    apiKeyUrl: 'https://console.mistral.ai/api-keys/',
    docsUrl: 'https://docs.mistral.ai',
    modelsUrl: 'https://docs.mistral.ai/getting-started/models/models_overview',
    modelsApi: 'https://api.mistral.ai/v1/models',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultApiKeyPlaceholder: 'sk-...',
    defaultModels: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Groq 推理',
    avatar: GroqImage,
    homeUrl: 'https://groq.com/',
    apiKeyUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs/quickstart',
    modelsUrl: 'https://console.groq.com/docs/models',
    modelsApi: 'https://api.groq.com/openai/v1/models',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultApiKeyPlaceholder: '...',
    defaultModels: ['llama3-70b-8192', 'mixtral-8x7b-32768'],
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    description: 'Kimi / Moonshot API',
    avatar: MoonshotImage,
    homeUrl: 'https://www.moonshot.cn/',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    docsUrl: 'https://platform.moonshot.cn/docs/',
    modelsUrl: 'https://platform.moonshot.cn/docs/intro',
    modelsApi: 'https://api.moonshot.cn/v1/models',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultApiKeyPlaceholder: 'sk-...',
    defaultModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  {
    id: 'zhipu',
    name: 'ZhiPu',
    description: 'GLM 系列',
    avatar: ZhiPuImage,
    homeUrl: 'https://open.bigmodel.cn/',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    docsUrl: 'https://docs.bigmodel.cn/',
    modelsUrl: 'https://open.bigmodel.cn/modelcenter/square',
    modelsApi: 'https://open.bigmodel.cn/api/paas/v4/models',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultApiKeyPlaceholder: '...',
    defaultModels: ['glm-4', 'glm-4v', 'glm-3-turbo'],
  },
]
