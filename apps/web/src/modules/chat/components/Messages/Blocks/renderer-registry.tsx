import type { ReactNode } from 'react'
import type { MessageBlock, MessageBlockType } from '../message-blocks'

export interface MessageBlockRenderContext {
  role: 'user' | 'assistant'
  onRetry?: () => void
  onToolApprove?: (toolCallId: string) => void
  onToolReject?: (toolCallId: string) => void
}

export type MessageBlockRendererFn<TBlock extends MessageBlock = MessageBlock> = (
  block: TBlock,
  context: MessageBlockRenderContext,
) => ReactNode

const renderers = new Map<MessageBlockType, MessageBlockRendererFn>()

export function registerMessageBlockRenderer<TBlock extends MessageBlock>(
  type: TBlock['type'],
  renderer: MessageBlockRendererFn<TBlock>,
): () => void {
  const registeredRenderer = renderer as MessageBlockRendererFn
  const previous = renderers.get(type)
  renderers.set(type, registeredRenderer)
  return () => {
    if (renderers.get(type) !== registeredRenderer) return
    if (previous) renderers.set(type, previous)
    else renderers.delete(type)
  }
}

export function getMessageBlockRenderer(type: MessageBlockType): MessageBlockRendererFn | undefined {
  return renderers.get(type)
}

export function renderRegisteredMessageBlock(
  block: MessageBlock,
  context: MessageBlockRenderContext,
): ReactNode {
  return getMessageBlockRenderer(block.type)?.(block, context) ?? null
}
