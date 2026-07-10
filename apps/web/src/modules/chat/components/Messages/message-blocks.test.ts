import { existsSync, readFileSync } from 'node:fs'

import {
  MessageBlockStatus,
  MessageBlockType,
  parseMessageBlocks,
  serializeMessageBlocks,
  type MessageBlock,
} from './message-blocks'

describe('message block models boundary', () => {
  it('persists the canonical models blocks contract instead of an app-local items contract', () => {
    const blocks: MessageBlock[] = [{
      id: 'message-1-task_progress-0',
      messageId: 'message-1',
      type: MessageBlockType.TASK_PROGRESS,
      createdAt: '2026-07-10T09:00:00.000Z',
      status: MessageBlockStatus.SUCCESS,
      task: 'task-1',
      title: 'Indexing',
      steps: [],
      currentStep: 0,
      totalSteps: 0,
    }]

    const serialized = serializeMessageBlocks(blocks)
    expect(JSON.parse(serialized)).toEqual({ blocks })
    expect(parseMessageBlocks(serialized)).toEqual(blocks)
  })

  it('keeps Web as a thin consumer of the shared block model', () => {
    const source = readFileSync('src/modules/chat/components/Messages/message-blocks.ts', 'utf8')

    expect(source).toContain("from '@undefineds.co/models'")
    expect(source).not.toContain('export enum MessageBlockType')
    expect(source).not.toContain('interface ToolApprovalMessageBlock')
    expect(existsSync('src/modules/chat/components/Messages/message-rich-content-compat.ts')).toBe(false)
  })
})
