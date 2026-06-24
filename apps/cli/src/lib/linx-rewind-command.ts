import { Container, getKeybindings, Spacer, Text, truncateToWidth } from '@earendil-works/pi-tui'
import {
  getLinxInteractiveAutoInputController,
  isLinxInteractiveAutoModeEnabled,
  setLinxInteractiveAutoModeEnabled,
} from './linx-interactive-shell-state.js'
import { showLinxInteractiveError } from './linx-interactive-error-display.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'
import { showLinxInteractiveWarning } from './linx-interactive-warning-display.js'
import { refreshLinxInteractiveChatTranscript } from './linx-interactive-chat-text-host.js'
import { getLinxPodMirrorForRuntime } from './linx-pod-mirror-runtime-host.js'
import {
  assertLinxRewindUserEntryTarget,
  collectLinxRewindUserMessages,
  describeLinxRewindTarget,
  hasLinxSessionHistory,
  rewindLinxSessionHistoryBeforeUserEntry,
  rewindLinxSessionHistoryByTurns,
  type LinxRewindMessageItem,
  type LinxSessionHistoryRewindResult,
} from './linx-session-history.js'
import { stopLinxActiveSessionWork } from './linx-session-work-control.js'

export async function handleInteractiveRewindSelector(interactive: any, runtime: any): Promise<void> {
  const session = resolveInteractiveSession(interactive, runtime)
  if (!hasLinxSessionHistory({ interactive, runtime })) {
    showLinxInteractiveError(interactive, 'Cannot rewind: no active LinX session history.')
    showLinxInteractiveStatus(interactive, null)
    return
  }

  if (typeof interactive.showSelector !== 'function') {
    await handleInteractiveRewindTurnsCommand(interactive, runtime, 1)
    return
  }

  const userMessages = collectLinxRewindUserMessages({ interactive, runtime })
  if (userMessages.length === 0) {
    showLinxInteractiveStatus(interactive, 'Nothing to rewind: no user turns in the active branch.')
    return
  }

  const initialSelectedId = userMessages[userMessages.length - 1]?.id
  interactive.showSelector((done: () => void) => {
    const selector = new LinxRewindMessageSelectorComponent(
      userMessages,
      async (entryId) => {
        try {
          assertLinxRewindUserEntryTarget({ interactive, runtime }, entryId)
          await stopLinxActiveSessionWork(session)
          resetPendingAutoInputForRewind(interactive, runtime)
          const result = rewindLinxSessionHistoryBeforeUserEntry({ interactive, runtime }, entryId)
          if (!result) {
            throw new Error('Cannot rewind: no active LinX session history.')
          }
          refreshInteractiveTranscriptAfterRewind(interactive)
          await syncRewindProjection(interactive, runtime, result)
          const target = describeLinxRewindTarget(result.targetLeafId, result.cleanResult)
          const suffix = formatRemainingMessageSuffix(result.remainingMessages)
          showLinxInteractiveStatus(interactive, `Rewound to before selected message at ${target}.${suffix}`)
          done()
        } catch (error) {
          done()
          showLinxInteractiveError(interactive, error instanceof Error ? error.message : String(error))
        }
      },
      () => {
        done()
        showLinxInteractiveStatus(interactive, null)
      },
      initialSelectedId,
    )
    return { component: selector, focus: selector.getMessageList() }
  })
}

export async function handleInteractiveRewindTurnsCommand(
  interactive: any,
  runtime: any,
  turns: number,
): Promise<void> {
  if (!Number.isSafeInteger(turns) || turns <= 0) {
    showLinxInteractiveStatus(interactive, 'Usage: /rewind [turns] where turns is a positive integer.')
    return
  }

  const session = resolveInteractiveSession(interactive, runtime)
  if (!hasLinxSessionHistory({ interactive, runtime })) {
    showLinxInteractiveError(interactive, 'Cannot rewind: no active LinX session history.')
    showLinxInteractiveStatus(interactive, null)
    return
  }

  await stopLinxActiveSessionWork(session)
  resetPendingAutoInputForRewind(interactive, runtime)

  const result = rewindLinxSessionHistoryByTurns({ interactive, runtime }, turns)
  if (!result || result.rewound === 0) {
    showLinxInteractiveStatus(interactive, 'Nothing to rewind: no user turns in the active branch.')
    return
  }

  refreshInteractiveTranscriptAfterRewind(interactive)
  await syncRewindProjection(interactive, runtime, result)
  const target = describeLinxRewindTarget(result.targetLeafId, result.cleanResult)
  const suffix = formatRemainingMessageSuffix(result.remainingMessages)
  showLinxInteractiveStatus(interactive, `Rewound ${result.rewound} turn${result.rewound === 1 ? '' : 's'} to ${target}.${suffix}`)
}

function resolveInteractiveSession(interactive: any, runtime: any): any {
  return interactive?.session ?? runtime?.session
}

function resetPendingAutoInputForRewind(interactive: any, runtime: any): void {
  const controller = getLinxInteractiveAutoInputController<{ stop(): void; start(options?: { scheduleImmediately?: boolean }): void }>(interactive)
  if (!isLinxInteractiveAutoModeEnabled(interactive, runtime) || !controller) {
    return
  }

  try {
    controller.stop()
    controller.start({ scheduleImmediately: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showLinxInteractiveWarning(interactive, `Auto input reset after rewind failed: ${message}`)
  }

  setLinxInteractiveAutoModeEnabled(interactive, runtime, true)
}

async function syncRewindProjection(
  interactive: any,
  runtime: any,
  input: LinxSessionHistoryRewindResult,
): Promise<void> {
  if (input.cleanResult.warning) {
    showLinxInteractiveWarning(interactive, `Clean rewind history materialization skipped: ${input.cleanResult.warning}`)
  }

  const mirror = getLinxPodMirrorForRuntime(runtime) ?? getLinxPodMirrorForRuntime(interactive?.runtime)
  if (!mirror || typeof mirror.syncRewindProjection !== 'function') {
    return
  }

  try {
    await mirror.syncRewindProjection({
      previousSessionId: input.previousState.id,
      previousSessionFile: input.previousState.file,
      previousCreatedAt: input.previousState.createdAt,
      cleanSessionId: input.cleanResult.id,
      cleanSessionFile: input.cleanResult.file,
      abandonedEntries: input.abandonedEntries,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showLinxInteractiveWarning(interactive, `Pod rewind projection unavailable: ${message}`)
  }
}

function refreshInteractiveTranscriptAfterRewind(interactive: any): void {
  try {
    refreshLinxInteractiveChatTranscript(interactive)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showLinxInteractiveWarning(interactive, `Rewind transcript refresh failed: ${message}`)
  }
}

function formatRemainingMessageSuffix(remainingMessages: number | undefined): string {
  return remainingMessages === undefined ? '' : ` Active context now has ${remainingMessages} message${remainingMessages === 1 ? '' : 's'}.`
}

class LinxRewindMessageList {
  private selectedIndex: number
  onSelect?: (entryId: string) => void
  onCancel?: () => void
  private readonly maxVisible = 10

  constructor(
    private readonly messages: LinxRewindMessageItem[],
    initialSelectedId?: string,
  ) {
    const initialIndex = initialSelectedId
      ? messages.findIndex((message) => message.id === initialSelectedId)
      : -1
    this.selectedIndex = initialIndex >= 0 ? initialIndex : Math.max(0, messages.length - 1)
  }

  invalidate(): void {
    // No cached render state.
  }

  render(width: number): string[] {
    const lines: string[] = []
    if (this.messages.length === 0) {
      return ['  No user messages found']
    }

    const startIndex = Math.max(0, Math.min(
      this.selectedIndex - Math.floor(this.maxVisible / 2),
      this.messages.length - this.maxVisible,
    ))
    const endIndex = Math.min(startIndex + this.maxVisible, this.messages.length)

    for (let index = startIndex; index < endIndex; index += 1) {
      const message = this.messages[index]
      const isSelected = index === this.selectedIndex
      const cursor = isSelected ? '> ' : '  '
      const normalized = message.text.replace(/\n/g, ' ').trim()
      lines.push(`${cursor}${truncateToWidth(normalized, Math.max(1, width - 2))}`)
      lines.push(`  Rewind before message ${index + 1} of ${this.messages.length}`)
      lines.push('')
    }

    if (startIndex > 0 || endIndex < this.messages.length) {
      lines.push(`  (${this.selectedIndex + 1}/${this.messages.length})`)
    }
    return lines
  }

  handleInput(keyData: string): void {
    const keybindings = getKeybindings()
    if (keybindings.matches(keyData, 'tui.select.up')) {
      this.selectedIndex = this.selectedIndex === 0 ? this.messages.length - 1 : this.selectedIndex - 1
      return
    }
    if (keybindings.matches(keyData, 'tui.select.down')) {
      this.selectedIndex = this.selectedIndex === this.messages.length - 1 ? 0 : this.selectedIndex + 1
      return
    }
    if (keybindings.matches(keyData, 'tui.select.confirm')) {
      const selected = this.messages[this.selectedIndex]
      if (selected) {
        this.onSelect?.(selected.id)
      }
      return
    }
    if (keybindings.matches(keyData, 'tui.select.cancel')) {
      this.onCancel?.()
    }
  }
}

class LinxRewindMessageSelectorComponent extends Container {
  private readonly messageList: LinxRewindMessageList

  constructor(
    messages: LinxRewindMessageItem[],
    onSelect: (entryId: string) => void,
    onCancel: () => void,
    initialSelectedId?: string,
  ) {
    super()
    this.addChild(new Spacer(1))
    this.addChild(new Text('Rewind to Message', 1, 0))
    this.addChild(new Text('Select the first user message to remove from the active branch.', 1, 0))
    this.addChild(new Text('The selected message and everything after it stay in history but leave the active context.', 1, 0))
    this.addChild(new Spacer(1))
    this.messageList = new LinxRewindMessageList(messages, initialSelectedId)
    this.messageList.onSelect = onSelect
    this.messageList.onCancel = onCancel
    this.addChild(this.messageList)
    this.addChild(new Spacer(1))

    if (messages.length === 0) {
      setTimeout(() => onCancel(), 100)
    }
  }

  getMessageList(): LinxRewindMessageList {
    return this.messageList
  }
}
