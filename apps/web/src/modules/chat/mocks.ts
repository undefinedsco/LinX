import { MessageBlockType, MessageBlockStatus, serializeMessageBlocks } from '@linx/models'
import type { MessageData } from './components/Messages'

const now = new Date();
const ONE_HOUR = 3600000;
const ONE_DAY = 86400000;

// 生成具有不同时间跨度和状态的模拟聊天
export const MOCK_CHATS = [
  {
    id: 'chat-0',
    title: '项目同步 (今天 10分钟前)',
    lastMessagePreview: 'Bob: 好的，我们上午10点见。',
    updatedAt: new Date(now.getTime() - 10 * 60000).toISOString(),
    starred: true,
    unreadCount: 2,
    type: 'group'
  },
  {
    id: 'chat-1',
    title: 'CodeMaster (今天 2小时前)',
    lastMessagePreview: '这是重构后的代码块，请查收。',
    updatedAt: new Date(now.getTime() - 2 * ONE_HOUR).toISOString(),
    starred: true,
    type: 'agent'
  },
  {
    id: 'chat-2',
    title: '产品设计讨论 (昨天)',
    lastMessagePreview: 'Alice: 原型图已经更新到 Figma 了。',
    updatedAt: new Date(now.getTime() - 1.2 * ONE_DAY).toISOString(),
    starred: true,
    type: 'group'
  },
  {
    id: 'chat-3',
    title: '架构周会 (3天前)',
    lastMessagePreview: '下周一我们需要讨论数据同步方案。',
    updatedAt: new Date(now.getTime() - 3 * ONE_DAY).toISOString(),
    starred: false,
    type: 'group'
  },
  {
    id: 'chat-4',
    title: '市场计划 (1个月前)',
    lastMessagePreview: '预算已经通过审核。',
    updatedAt: new Date(now.getTime() - 30 * ONE_DAY).toISOString(),
    starred: false,
    type: 'group'
  },
  {
    id: 'chat-5',
    title: '老旧会话 (去年)',
    lastMessagePreview: '去年的年度总结报告。',
    updatedAt: new Date(now.getTime() - 400 * ONE_DAY).toISOString(),
    starred: false,
    type: 'group'
  },
  // 更多普通会话用于测试滚动
  ...Array.from({ length: 15 }).map((_, i) => ({
    id: `chat-extra-${i}`,
    title: `普通联系人 ${i + 1}`,
    lastMessagePreview: `这是第 ${i + 1} 条普通消息预览内容...`,
    updatedAt: new Date(now.getTime() - (i + 5) * ONE_DAY).toISOString(),
    starred: false,
    type: 'person'
  }))
];

export const MOCK_THREADS = [
  {
    id: 't1',
    title: '关于 React 性能优化',
    updatedAt: new Date().toISOString(),
    starred: true
  },
  {
    id: 't2',
    title: 'TypeScript 类型系统深度解析',
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    starred: false
  },
  {
    id: 't3',
    title: 'CSS Grid vs Flexbox',
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
    starred: false
  },
  {
    id: 't4',
    title: 'Next.js 14 App Router',
    updatedAt: new Date(Date.now() - 259200000).toISOString(),
    starred: false
  },
  {
    id: 't5',
    title: 'State Management 2024',
    updatedAt: new Date(Date.now() - 345600000).toISOString(),
    starred: false
  }
]

export const MOCK_MESSAGES: MessageData[] = [
  {
    id: 'm1',
    role: 'user',
    content: '你好，能帮我解释下什么是 React 的 Concurrent Mode 吗？',
    status: 'sent',
    createdAt: new Date(Date.now() - 3600000)
  },
  {
    id: 'm2',
    role: 'assistant',
    content: '当然可以！React Concurrent Mode（并发模式）是 React 18 引入的一组新特性，它允许 React 在渲染过程中可以中断。',
    richContent: serializeMessageBlocks([
      {
        id: 'b1',
        messageId: 'm2',
        type: MessageBlockType.THINKING,
        status: MessageBlockStatus.SUCCESS,
        content: '用户询问 Concurrent Mode。我需要解释其核心概念：可中断渲染、任务优先级。',
        createdAt: new Date().toISOString()
      },
      {
        id: 'b2',
        messageId: 'm2',
        type: MessageBlockType.MAIN_TEXT,
        status: MessageBlockStatus.SUCCESS,
        content: '### 什么是 Concurrent Mode？\n\nConcurrent Mode 并不是一个单一的特性，而是一个底层架构的改进，它允许 React **同时准备多个版本的 UI**。\n\n它的核心优势包括：\n1. **可中断渲染**：React 可以暂停正在进行的更新去处理更高优先级的事件（如点击），然后再回来。\n2. **并发更新**：多个状态更新可以同时进行，互不阻塞。',
        createdAt: new Date().toISOString()
      }
    ]),
    status: 'sent',
    createdAt: new Date(Date.now() - 3590000),
    model: { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    modelLogoUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=OpenAI'
  },
  {
    id: 'm3',
    role: 'user',
    content: '那它和传统的渲染方式有什么区别？',
    status: 'sent',
    createdAt: new Date(Date.now() - 3500000)
  },
  {
    id: 'm4',
    role: 'assistant',
    content: '在传统渲染（阻塞渲染）中，一旦渲染开始，主线程就会被占用，直到渲染结束。',
    richContent: serializeMessageBlocks([
      {
        id: 'b3',
        messageId: 'm4',
        type: MessageBlockType.TOOL,
        status: MessageBlockStatus.SUCCESS,
        toolId: 'web-search',
        toolName: 'google_search',
        arguments: { query: 'React blocking vs concurrent rendering' },
        content: '找到 5 篇相关文档，对比了递归渲染和 Fiber 架构下的并发渲染。',
        createdAt: new Date().toISOString()
      },
      {
        id: 'b4',
        messageId: 'm4',
        type: MessageBlockType.MAIN_TEXT,
        status: MessageBlockStatus.SUCCESS,
        content: '传统的渲染像是 **一次性吃完一大碗面**，中途不能停；而并发渲染像是 **吃火锅**，你可以吃一口面，再去倒杯水，回来继续吃。',
        createdAt: new Date().toISOString()
      }
    ]),
    status: 'sent',
    createdAt: new Date(Date.now() - 3490000),
    model: { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'anthropic' },
    modelLogoUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=Anthropic'
  }
]
