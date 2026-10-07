import type { ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'

export function createWaitingToolbarEvent(threadId: string, itemId: string, text = '处理中…'): ThreadStreamEvent {
  return {
    type: 'thread.item.added',
    item: {
      id: itemId,
      thread_id: threadId,
      created_at: Math.floor(Date.now() / 1000),
      type: 'widget',
      widget: {
        type: 'Basic',
        direction: 'col',
        gap: 2,
        children: [
          { type: 'Row', gap: 2, align: 'center', children: [
            { type: 'Icon', name: 'spinner' },
            { type: 'Text', value: text, color: 'secondary' },
          ] },
          { type: 'Row', gap: 1, children: [
            ...[['复制', 'copy'], ['点赞', 'thumb-up'], ['点踩', 'thumb-down'], ['重新生成', 'reload']].map(([label, iconStart]) => ({
              type: 'Button', label, iconStart, variant: 'ghost', size: 'sm', disabled: true,
            })),
            {
              type: 'Button', label: '停止生成', iconStart: 'stop', variant: 'ghost', size: 'sm',
              onClickAction: { type: 'linx.stop-generation', handler: 'client' },
            },
          ] },
        ],
      },
    },
  }
}

export function createAssistantTextDeltaEvent(
  itemId: string,
  delta: string,
): ThreadStreamEvent {
  return {
    type: 'thread.item.updated',
    item_id: itemId,
    update: {
      type: 'assistant_message.content_part.text_delta',
      content_index: 0,
      delta,
    },
  }
}
