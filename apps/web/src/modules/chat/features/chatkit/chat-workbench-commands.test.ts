import { describe, expect, it } from 'vitest'
import { createChatWorkbenchCommands } from './chat-workbench-commands'

describe('createChatWorkbenchCommands', () => {
  it('moves secondary chat actions into the composer command menu', () => {
    const commands = createChatWorkbenchCommands({
      hasEditableMessage: true,
      hasReadableAnswer: true,
      isReading: false,
      canOpenProjectContext: true,
      attachmentCount: 2,
      canOpenResources: true,
      canShare: true,
      messageBranch: { index: 1, count: 2 },
      answerBranch: { index: 0, count: 2 },
    })

    expect(commands.map((command) => command.id)).toEqual([
      'linx.previous-message-branch',
      'linx.next-answer-branch',
      'linx.edit-latest-message',
      'linx.read-latest-answer',
      'linx.open-project-context',
      'linx.open-attachments',
      'linx.open-capture',
      'linx.open-voice',
      'linx.open-artifacts',
      'linx.open-assets',
      'linx.open-share',
    ])
    expect(commands.find((command) => command.id === 'linx.open-attachments')?.label).toContain('2')
  })

  it('omits unavailable and out-of-range actions', () => {
    const commands = createChatWorkbenchCommands({
      hasEditableMessage: false,
      hasReadableAnswer: false,
      isReading: false,
      canOpenProjectContext: false,
      attachmentCount: 0,
      canOpenResources: false,
      canShare: false,
      messageBranch: { index: 0, count: 2 },
      answerBranch: undefined,
    })

    expect(commands.map((command) => command.id)).toEqual([
      'linx.next-message-branch',
      'linx.open-capture',
      'linx.open-voice',
    ])
  })
})
