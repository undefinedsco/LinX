export const MOCK_CONTACTS = [
  {
    id: 'c1',
    type: 'person',
    name: 'Alice Smith',
    alias: 'Alice',
    note: 'Frontend Lead',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
    region: 'New York, US',
    source: '通过搜索添加',
    email: 'alice@linx.example',
  },
  {
    id: 'c2',
    type: 'person',
    name: 'Bob Jones',
    alias: 'Bob',
    note: 'Product Manager',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob',
    region: 'London, UK',
    source: '通过群聊添加',
  },
  {
    id: 'a1',
    type: 'agent',
    name: 'Coding Assistant',
    alias: 'CodeMaster',
    note: 'Python & TS Expert',
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=CodeMaster',
    region: 'Cloud',
    source: '系统预设',
    systemPrompt: 'You are an expert full-stack developer. You answer in concise code blocks.',
    model: 'gpt-4-turbo',
  },
  {
    id: 'a2',
    type: 'agent',
    name: 'Translator',
    alias: '中英翻译',
    note: 'Translation Bot',
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=Trans',
    region: 'Local',
    source: '自建 Agent',
    systemPrompt: 'Translate the following text to Chinese. Be formal.',
    model: 'gpt-3.5-turbo',
  },
]

export const MOCK_CHATS = [
  {
    id: 'chat1',
    title: 'Project Sync',
    lastMessagePreview: 'Bob: Let\'s meet at 10 AM.',
    updatedAt: new Date().toISOString(),
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=Project',
    type: 'group',
  },
  {
    id: 'chat2',
    title: 'CodeMaster',
    lastMessagePreview: 'Here is the refactored code...',
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=CodeMaster',
    type: 'agent',
  },
]

export const MOCK_CREDENTIALS = [
  {
    id: 'k1',
    name: 'OpenAI Main',
    provider: 'openai',
    apiKey: 'sk-proj-1234567890abcdef',
    description: 'Used for production agents',
    isDefault: true,
  },
  {
    id: 'k2',
    name: 'Local LLM',
    provider: 'ollama',
    apiKey: 'ollama-local-key',
    baseUrl: 'http://localhost:11434',
    description: 'Local development',
    isDefault: false,
  },
]




