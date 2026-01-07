export interface AgentModelOption {
  id: string
  displayName: string
}

export interface AgentProviderMetadata {
  slug: string
  displayName: string
  baseUrl?: string
  homepage?: string
  logoUrl?: string
  models: AgentModelOption[]
}

export const DEFAULT_AGENT_PROVIDERS: AgentProviderMetadata[] = [
  {
    slug: 'openai',
    displayName: 'OpenAI',
    homepage: 'https://platform.openai.com',
    logoUrl: 'https://openai.com/favicon.ico',
    models: [
      { id: 'gpt-4o-mini', displayName: 'GPT-4o mini' },
      { id: 'gpt-4o', displayName: 'GPT-4o' },
      { id: 'gpt-4o-realtime', displayName: 'GPT-4o Realtime' },
    ],
  },
  {
    slug: 'anthropic',
    displayName: 'Anthropic',
    homepage: 'https://www.anthropic.com',
    logoUrl: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/anthropic.svg',
    models: [
      { id: 'claude-3-5-sonnet-latest', displayName: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus', displayName: 'Claude 3 Opus' },
      { id: 'claude-3-haiku', displayName: 'Claude 3 Haiku' },
    ],
  },
  {
    slug: 'google',
    displayName: 'Google (Gemini)',
    homepage: 'https://ai.google.dev',
    logoUrl: 'https://ai.google.dev/favicon.ico',
    models: [
      { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
    ],
  },
  {
    slug: 'x-ai',
    displayName: 'xAI',
    homepage: 'https://x.ai',
    logoUrl: 'https://x.ai/favicon.ico',
    models: [
      { id: 'grok-2', displayName: 'Grok-2' },
    ],
  },
  {
    slug: 'deepseek',
    displayName: 'DeepSeek',
    homepage: 'https://www.deepseek.com',
    logoUrl: 'https://www.deepseek.com/favicon.ico',
    models: [
      { id: 'deepseek-chat', displayName: 'DeepSeek Chat' },
      { id: 'deepseek-coder', displayName: 'DeepSeek Coder' },
    ],
  },
  {
    slug: 'openrouter',
    displayName: 'OpenRouter',
    homepage: 'https://openrouter.ai',
    logoUrl: 'https://openrouter.ai/favicon.ico',
    models: [
      { id: 'openai/gpt-4o-mini', displayName: 'GPT-4o mini' },
      { id: 'openai/gpt-4o', displayName: 'GPT-4o' },
      { id: 'anthropic/claude-3.5-sonnet', displayName: 'Claude 3.5 Sonnet' },
      { id: 'anthropic/claude-3-haiku', displayName: 'Claude 3 Haiku' },
      { id: 'google/gemini-flash-1.5', displayName: 'Gemini 1.5 Flash' },
      { id: 'deepseek/deepseek-chat', displayName: 'DeepSeek Chat' },
      { id: 'meta-llama/llama-3.1-8b-instruct', displayName: 'Llama 3.1 8B' },
      { id: 'qwen/qwen-2.5-72b-instruct', displayName: 'Qwen 2.5 72B' },
    ],
  },
]
