import type { ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'

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
