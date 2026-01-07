/**
 * Messages 组件导出
 * 
 * 基于 Cherry Studio 的 block-based 消息系统
 */

// 核心消息组件
export { Message, type MessageProps, type MessageData } from './Message'
export { MessageList, type MessageListProps } from './MessageList'
export { MessageHeader, type MessageHeaderProps } from './MessageHeader'
export { MessageMenubar, type MessageMenubarProps } from './MessageMenubar'

// Block 渲染器
export {
  MessageBlockRenderer,
  MainTextBlock,
  ThinkingBlock,
  ToolBlock,
  ErrorBlock,
  PlaceholderBlock,
} from './Blocks'
