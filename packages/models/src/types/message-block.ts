import type {
  ToolApprovalStatus,
  ToolCallStatus,
  TaskProgressStepStatus,
} from './collaboration-blocks'

/**
 * Message Block Types - 基于 Cherry Studio 的 block-based 消息系统
 * 
 * 将消息内容拆分为多个块（blocks），支持：
 * - 主文本 (Markdown)
 * - 思考过程 (CoT/Reasoning)
 * - 工具调用
 * - 图片/文件
 * - 引用/搜索结果
 * - 错误信息
 */

// 块类型枚举
export enum MessageBlockType {
  /** 未知类型，用于流式响应开始前 */
  UNKNOWN = 'unknown',
  /** 主要文本内容（Markdown） */
  MAIN_TEXT = 'main_text',
  /** 思考过程（Claude、DeepSeek R1、OpenAI o-系列等） */
  THINKING = 'thinking',
  /** 图片内容 */
  IMAGE = 'image',
  /** 代码块（独立可运行） */
  CODE = 'code',
  /** 工具调用及响应 */
  TOOL = 'tool',
  /** 工具审批卡片 */
  TOOL_APPROVAL = 'tool_approval',
  /** 任务进度卡片 */
  TASK_PROGRESS = 'task_progress',
  /** 文件内容 */
  FILE = 'file',
  /** 错误信息 */
  ERROR = 'error',
  /** 引用类型（Web 搜索、知识库等） */
  CITATION = 'citation',
}

// 块状态定义
export enum MessageBlockStatus {
  /** 等待处理 */
  PENDING = 'pending',
  /** 正在处理，等待接收 */
  PROCESSING = 'processing',
  /** 正在流式接收 */
  STREAMING = 'streaming',
  /** 处理成功 */
  SUCCESS = 'success',
  /** 处理错误 */
  ERROR = 'error',
  /** 处理暂停 */
  PAUSED = 'paused',
}

// 基础块类型
export interface BaseMessageBlock {
  /** 块 ID */
  id: string
  /** 所属消息 ID */
  messageId: string
  /** 块类型 */
  type: MessageBlockType
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt?: string
  /** 块状态 */
  status: MessageBlockStatus
  /** 使用的模型 */
  model?: {
    id: string
    name: string
    provider: string
  }
  /** 通用元数据 */
  metadata?: Record<string, unknown>
  /** 错误信息 */
  error?: {
    code?: string
    message: string
    details?: unknown
  }
}

// 占位符块
export interface PlaceholderMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.UNKNOWN
}

// 主文本块 - 核心内容
export interface MainTextMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.MAIN_TEXT
  /** Markdown 内容 */
  content: string
  /** 关联的知识库 ID */
  knowledgeBaseIds?: string[]
  /** 引用参考 */
  citationReferences?: Array<{
    citationBlockId?: string
    url?: string
    title?: string
  }>
}

// 思考块 - 模型推理过程
export interface ThinkingMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.THINKING
  /** 思考内容 */
  content: string
  /** 思考耗时（毫秒） */
  thinkingDuration?: number
}

// 代码块 - 专门处理代码
export interface CodeMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.CODE
  /** 代码内容 */
  content: string
  /** 代码语言 */
  language: string
  /** 是否可执行 */
  executable?: boolean
  /** 执行结果 */
  executionResult?: {
    output?: string
    error?: string
    exitCode?: number
  }
}

// 图片块
export interface ImageMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.IMAGE
  /** 图片 URL */
  url?: string
  /** 本地文件路径 */
  filePath?: string
  /** 图片元数据 */
  metadata?: BaseMessageBlock['metadata'] & {
    /** 生成提示词 */
    prompt?: string
    /** 负面提示词 */
    negativePrompt?: string
    /** 原始文件名 */
    fileName?: string
    /** 文件大小 */
    fileSize?: number
    /** 宽度 */
    width?: number
    /** 高度 */
    height?: number
  }
}

// 工具调用块
export interface ToolMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.TOOL
  /** 协作链路中的工具调用 ID（与 CP0 ToolCallBlock 对齐） */
  toolCallId?: string
  /** 工具 ID */
  toolId: string
  /** 工具名称 */
  toolName: string
  /** 调用参数 */
  arguments?: Record<string, unknown>
  /** 响应内容 */
  content?: string | object
  /** CP0 协作契约状态（waiting_approval / running / done ...） */
  toolStatus?: ToolCallStatus
  /** 执行结果（CP0 ToolCallBlock.result） */
  result?: unknown
  /** 错误信息（CP0 ToolCallBlock.error） */
  toolError?: string
  /** 耗时（ms） */
  duration?: number
  /** 工具元数据 */
  metadata?: BaseMessageBlock['metadata'] & {
    /** 是否来自 MCP */
    isMcp?: boolean
    /** MCP 服务器名称 */
    mcpServer?: string
  }
}

// 工具审批块（CP0 合同）
export interface ToolApprovalMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.TOOL_APPROVAL
  toolCallId: string
  toolName: string
  toolDescription: string
  arguments: Record<string, unknown>
  risk: 'low' | 'medium' | 'high'
  approvalStatus: ToolApprovalStatus
  approvedBy?: string
  approvedAt?: string
  decisionBy?: string
  decisionRole?: 'human' | 'secretary' | 'system'
  onBehalfOf?: string
  reason?: string
  policyVersion?: string
  inboxItemId?: string
}

// 任务进度块（CP0 合同）
export interface TaskProgressMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.TASK_PROGRESS
  taskId: string
  title: string
  steps: Array<{
    id: string
    label: string
    status: TaskProgressStepStatus
    detail?: string
    duration?: number
  }>
  currentStep: number
  totalSteps: number
}

// 引用块
export interface CitationMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.CITATION
  /** Web 搜索结果 */
  webSearch?: {
    query: string
    results: Array<{
      title: string
      url: string
      snippet?: string
      favicon?: string
    }>
  }
  /** 知识库引用 */
  knowledge?: Array<{
    id: string
    title: string
    content: string
    source?: string
  }>
}

// 文件块
export interface FileMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.FILE
  /** 文件名 */
  fileName: string
  /** 文件路径或 URL */
  fileUrl: string
  /** 文件大小 */
  fileSize?: number
  /** MIME 类型 */
  mimeType?: string
}

// 错误块
export interface ErrorMessageBlock extends BaseMessageBlock {
  type: MessageBlockType.ERROR
  /** 错误消息 */
  message: string
  /** 是否可重试 */
  retryable?: boolean
}

// MessageBlock 联合类型
export type MessageBlock =
  | PlaceholderMessageBlock
  | MainTextMessageBlock
  | ThinkingMessageBlock
  | CodeMessageBlock
  | ImageMessageBlock
  | ToolMessageBlock
  | ToolApprovalMessageBlock
  | TaskProgressMessageBlock
  | FileMessageBlock
  | ErrorMessageBlock
  | CitationMessageBlock

// ============================================
// 辅助类型和函数
// ============================================

/**
 * 消息的 richContent JSON 结构
 * 存储在 Message.richContent 字段中
 */
export interface MessageRichContent {
  /** 向后兼容：思考内容 */
  thought?: string
  /** 向后兼容：工具调用 */
  toolInvocations?: Array<{
    id: string
    toolName: string
    input: unknown
    output?: unknown
    error?: string
  }>
  /** 新的块系统 */
  blocks?: MessageBlock[]
}

/**
 * 创建块的工厂函数
 */
export function createMessageBlock<T extends MessageBlock>(
  type: T['type'],
  messageId: string,
  partial: Omit<T, 'id' | 'messageId' | 'type' | 'createdAt' | 'status'>
): T {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return {
    id,
    messageId,
    type,
    createdAt: new Date().toISOString(),
    status: MessageBlockStatus.PENDING,
    ...partial,
  } as T
}

/**
 * 判断块类型
 */
export function isBlockType<T extends MessageBlock>(
  block: MessageBlock,
  type: T['type']
): block is T {
  return block.type === type
}

/**
 * 从 richContent JSON 解析块
 */
export function parseMessageBlocks(richContent: string | null | undefined): MessageBlock[] {
  if (!richContent) return []
  try {
    const parsed: MessageRichContent = JSON.parse(richContent)
    
    // 如果有新的块系统，直接返回
    if (parsed.blocks && parsed.blocks.length > 0) {
      return parsed.blocks
    }
    
    // 向后兼容：转换旧格式
    const blocks: MessageBlock[] = []
    
    if (parsed.thought) {
      blocks.push({
        id: 'legacy-thought',
        messageId: '',
        type: MessageBlockType.THINKING,
        content: parsed.thought,
        createdAt: new Date().toISOString(),
        status: MessageBlockStatus.SUCCESS,
      } as ThinkingMessageBlock)
    }
    
    if (parsed.toolInvocations) {
      parsed.toolInvocations.forEach((ti, index) => {
        blocks.push({
          id: `legacy-tool-${index}`,
          messageId: '',
          type: MessageBlockType.TOOL,
          toolId: ti.id,
          toolName: ti.toolName,
          arguments: ti.input as Record<string, unknown>,
          content: ti.output ?? ti.error,
          createdAt: new Date().toISOString(),
          status: ti.error ? MessageBlockStatus.ERROR : MessageBlockStatus.SUCCESS,
        } as ToolMessageBlock)
      })
    }
    
    return blocks
  } catch {
    return []
  }
}

/**
 * 序列化块到 richContent JSON
 */
export function serializeMessageBlocks(blocks: MessageBlock[]): string {
  const content: MessageRichContent = { blocks }
  return JSON.stringify(content)
}
