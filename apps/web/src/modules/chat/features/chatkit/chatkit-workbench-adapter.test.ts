import { describe, expect, it, vi } from 'vitest'
import { createChatKitWorkbenchAdapter } from './chatkit-workbench-adapter'

function createClient() {
  return {
    setThreadId: vi.fn(async () => undefined),
    setComposerValue: vi.fn(async () => undefined),
    focusComposer: vi.fn(async () => undefined),
    fetchUpdates: vi.fn(async () => undefined),
    sendUserMessage: vi.fn(async () => undefined),
    sendCustomAction: vi.fn(async () => undefined),
  }
}

describe('createChatKitWorkbenchAdapter', () => {
  it('keeps renderer operations behind the conversation surface port', async () => {
    const client = createClient()
    const adapter = createChatKitWorkbenchAdapter({ client, context: () => ({ threadId: 'thread-1' }), interrupt: vi.fn() })

    await adapter.surface.setThread('thread-2')
    await adapter.surface.setDraft({ text: 'draft' })
    await adapter.surface.focusComposer()
    await adapter.surface.refresh()

    expect(client.setThreadId).toHaveBeenCalledWith('thread-2')
    expect(client.setComposerValue).toHaveBeenCalledWith({ text: 'draft' })
    expect(client.focusComposer).toHaveBeenCalledOnce()
    expect(client.fetchUpdates).toHaveBeenCalledOnce()
  })

  it('translates supported workbench commands and delegates runtime commands', async () => {
    const client = createClient()
    const interrupt = vi.fn()
    const approve = vi.fn(async () => undefined)
    const reject = vi.fn(async () => undefined)
    const provideInput = vi.fn(async () => undefined)
    const adapter = createChatKitWorkbenchAdapter({
      client,
      context: () => ({ threadId: 'thread-1' }),
      interrupt,
      approve,
      reject,
      provideInput,
    })

    await adapter.commands.editMessage('message-1', 'updated')
    await adapter.commands.deleteMessage('message-2')
    await adapter.commands.regenerateMessage('message-3')
    await adapter.commands.selectBranch('message-4', 'message-1')
    await adapter.commands.approve('approval-1')
    await adapter.commands.reject('approval-2')
    await adapter.commands.provideInput('input-1', { choice: 'A' })
    adapter.commands.interrupt()

    expect(client.sendCustomAction.mock.calls).toEqual([
      [{ type: 'message.edit', payload: { action: 'message.edit', thread_id: 'thread-1', item_id: 'message-1', text: 'updated', regenerate: true } }],
      [{ type: 'message.delete', payload: { action: 'message.delete', thread_id: 'thread-1', item_id: 'message-2' } }],
      [{ type: 'message.regenerate', payload: { action: 'message.regenerate', thread_id: 'thread-1', item_id: 'message-3' } }],
      [{ type: 'message.select_branch', payload: { action: 'message.select_branch', thread_id: 'thread-1', item_id: 'message-4', parent_item_id: 'message-1' } }],
    ])
    expect(interrupt).toHaveBeenCalledOnce()
    expect(approve).toHaveBeenCalledWith('approval-1')
    expect(reject).toHaveBeenCalledWith('approval-2')
    expect(provideInput).toHaveBeenCalledWith('input-1', { choice: 'A' })
  })

  it('fails explicitly when a runtime command is not connected', async () => {
    const adapter = createChatKitWorkbenchAdapter({ client: createClient(), context: () => ({ threadId: 'thread-1' }), interrupt: vi.fn() })
    await expect(adapter.commands.approve('approval-1')).rejects.toThrow('not connected')
  })
})
