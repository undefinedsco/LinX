import { Container, getKeybindings, Spacer, Text, truncateToWidth } from '@earendil-works/pi-tui'
import {
  getLinxInteractiveAutoInputController,
  isLinxInteractiveAutoModeEnabled,
  setLinxInteractiveAutoModeEnabled,
} from './linx-interactive-shell-state.js'
import { getLinxPodMirrorForRuntime } from './linx-pod-mirror-runtime-host.js'

export async function handleInteractiveRewindSelector(interactive: any, runtime: any): Promise<void> {
  const session = resolveInteractiveSession(interactive, runtime)
  const sessionManager = resolveInteractiveSessionManager(interactive, runtime)
  if (!sessionManager) {
    interactive.showError?.('Cannot rewind: no active LinX session history.')
    interactive.ui?.requestRender?.()
    return
  }

  if (typeof interactive.showSelector !== 'function') {
    await handleInteractiveRewindTurnsCommand(interactive, runtime, 1)
    return
  }

  const userMessages = collectRewindUserMessages(session, sessionManager)
  if (userMessages.length === 0) {
    interactive.showStatus?.('Nothing to rewind: no user turns in the active branch.')
    interactive.ui?.requestRender?.()
    return
  }

  const initialSelectedId = userMessages[userMessages.length - 1]?.id
  interactive.showSelector((done: () => void) => {
    const selector = new LinxRewindMessageSelectorComponent(
      userMessages,
      async (entryId) => {
        try {
          await rewindSessionManagerBeforeUserEntry(interactive, runtime, session, sessionManager, entryId)
          done()
        } catch (error) {
          done()
          interactive.showError?.(error instanceof Error ? error.message : String(error))
        }
      },
      () => {
        done()
        interactive.ui?.requestRender?.()
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
    interactive.showStatus?.('Usage: /rewind [turns] where turns is a positive integer.')
    interactive.ui?.requestRender?.()
    return
  }

  const session = resolveInteractiveSession(interactive, runtime)
  const sessionManager = resolveInteractiveSessionManager(interactive, runtime)
  if (!sessionManager) {
    interactive.showError?.('Cannot rewind: no active LinX session history.')
    interactive.ui?.requestRender?.()
    return
  }

  await stopActiveSessionWorkForRewind(session)
  resetPendingAutoInputForRewind(interactive, runtime)

  const previousState = captureRewindSessionState(sessionManager)
  const previousBranch = getActiveSessionBranch(sessionManager)
  const result = rewindSessionManagerByTurns(sessionManager, turns)
  if (result.rewound === 0) {
    interactive.showStatus?.('Nothing to rewind: no user turns in the active branch.')
    interactive.ui?.requestRender?.()
    return
  }

  const cleanResult = materializeCleanRewindSession(sessionManager, result.targetLeafId, previousState)
  syncAgentStateFromSessionManager(session, sessionManager)
  refreshInteractiveTranscriptFromSessionManager(interactive)
  await syncRewindProjection(interactive, runtime, {
    previousState,
    cleanResult,
    abandonedEntries: collectAbandonedRewindEntries(previousBranch, result.targetLeafId),
  })
  const remainingMessages = Array.isArray(session?.agent?.state?.messages)
    ? session.agent.state.messages.length
    : undefined
  const target = describeRewindTarget(result.targetLeafId, cleanResult)
  const suffix = remainingMessages === undefined ? '' : ` Active context now has ${remainingMessages} message${remainingMessages === 1 ? '' : 's'}.`
  interactive.showStatus?.(`Rewound ${result.rewound} turn${result.rewound === 1 ? '' : 's'} to ${target}.${suffix}`)
  interactive.ui?.requestRender?.()
}

async function rewindSessionManagerBeforeUserEntry(
  interactive: any,
  runtime: any,
  session: any,
  sessionManager: any,
  entryId: string,
): Promise<void> {
  const entry = typeof sessionManager?.getEntry === 'function'
    ? sessionManager.getEntry(entryId)
    : getActiveSessionBranch(sessionManager).find((candidate) => candidate?.id === entryId)
  if (!entry || entry.type !== 'message' || entry.message?.role !== 'user') {
    throw new Error('Cannot rewind: selected message is not a user turn in the active branch.')
  }

  const previousState = captureRewindSessionState(sessionManager)
  const previousBranch = getActiveSessionBranch(sessionManager)

  await stopActiveSessionWorkForRewind(session)
  resetPendingAutoInputForRewind(interactive, runtime)

  const targetLeafId = typeof entry.parentId === 'string' && entry.parentId ? entry.parentId : null
  moveSessionManagerLeaf(sessionManager, targetLeafId)
  const cleanResult = materializeCleanRewindSession(sessionManager, targetLeafId, previousState)
  syncAgentStateFromSessionManager(session, sessionManager)
  refreshInteractiveTranscriptFromSessionManager(interactive)
  await syncRewindProjection(interactive, runtime, {
    previousState,
    cleanResult,
    abandonedEntries: collectAbandonedRewindEntries(previousBranch, targetLeafId),
  })
  const remainingMessages = Array.isArray(session?.agent?.state?.messages)
    ? session.agent.state.messages.length
    : undefined
  const target = describeRewindTarget(targetLeafId, cleanResult)
  const suffix = remainingMessages === undefined ? '' : ` Active context now has ${remainingMessages} message${remainingMessages === 1 ? '' : 's'}.`
  interactive.showStatus?.(`Rewound to before selected message at ${target}.${suffix}`)
  interactive.ui?.requestRender?.()
}

function resolveInteractiveSession(interactive: any, runtime: any): any {
  return interactive?.session ?? runtime?.session
}

function resolveInteractiveSessionManager(interactive: any, runtime: any): any {
  return interactive?.session?.sessionManager
    ?? interactive?.sessionManager
    ?? runtime?.session?.sessionManager
    ?? runtime?.sessionManager
}

async function stopActiveSessionWorkForRewind(session: any): Promise<void> {
  if (!session) {
    return
  }

  const shouldWait = session.isStreaming === true || session.isBashRunning === true
  try {
    if (session.isBashRunning === true && typeof session.abortBash === 'function') {
      session.abortBash()
    }
    if (session.isStreaming === true && typeof session.abort === 'function') {
      session.abort()
    }
  } catch {
    // Rewind should still repair the active branch even if abort reporting fails.
  }

  if (!shouldWait || typeof session.agent?.waitForIdle !== 'function') {
    return
  }
  await Promise.race([
    Promise.resolve(session.agent.waitForIdle()).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 1_500)),
  ])
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
    interactive.showWarning?.(`Auto input reset after rewind failed: ${message}`)
  }

  setLinxInteractiveAutoModeEnabled(interactive, runtime, true)
}

function rewindSessionManagerByTurns(
  sessionManager: any,
  turns: number,
): { rewound: number; targetLeafId: string | null } {
  let rewound = 0
  let targetLeafId = resolveSessionManagerLeafId(sessionManager)

  for (; rewound < turns; rewound += 1) {
    const branch = getActiveSessionBranch(sessionManager)
    const latestUserEntry = findLatestUserMessageEntry(branch)
    if (!latestUserEntry) {
      break
    }

    targetLeafId = typeof latestUserEntry.parentId === 'string' && latestUserEntry.parentId
      ? latestUserEntry.parentId
      : null
    moveSessionManagerLeaf(sessionManager, targetLeafId)
  }

  return { rewound, targetLeafId }
}

function resolveSessionManagerLeafId(sessionManager: any): string | null {
  return typeof sessionManager?.getLeafId === 'function'
    ? sessionManager.getLeafId()
    : null
}

function getActiveSessionBranch(sessionManager: any): any[] {
  const hasLeafApi = typeof sessionManager?.getLeafId === 'function'
  const leafId = hasLeafApi ? sessionManager.getLeafId() : undefined
  if (hasLeafApi && leafId === null) {
    return []
  }
  if (typeof sessionManager?.getBranch === 'function') {
    const branch = hasLeafApi ? sessionManager.getBranch(leafId) : sessionManager.getBranch()
    return Array.isArray(branch) ? branch : []
  }
  const entries = typeof sessionManager?.getEntries === 'function' ? sessionManager.getEntries() : []
  return Array.isArray(entries) ? entries : []
}

function findLatestUserMessageEntry(branch: any[]): any | null {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index]
    if (entry?.type === 'message' && entry.message?.role === 'user') {
      return entry
    }
  }
  return null
}

function moveSessionManagerLeaf(sessionManager: any, leafId: string | null): void {
  if (leafId) {
    sessionManager.branch?.(leafId)
    return
  }
  sessionManager.resetLeaf?.()
}

interface RewindSessionState {
  id?: string
  file?: string
  createdAt?: Date
}

interface CleanRewindResult {
  materialized: boolean
  sessionChanged: boolean
  id?: string
  file?: string
  warning?: string
}

function captureRewindSessionState(sessionManager: any): RewindSessionState {
  return {
    id: normalizeRewindString(sessionManager?.getSessionId?.()),
    file: normalizeRewindString(sessionManager?.getSessionFile?.()),
    createdAt: resolveRewindSessionCreatedAt(sessionManager),
  }
}

function materializeCleanRewindSession(
  sessionManager: any,
  targetLeafId: string | null,
  previousState: RewindSessionState,
): CleanRewindResult {
  const beforeId = previousState.id
  let materialized = false
  let warning: string | undefined

  try {
    if (targetLeafId && typeof sessionManager?.createBranchedSession === 'function') {
      sessionManager.createBranchedSession(targetLeafId)
      materialized = true
    } else if (!targetLeafId && typeof sessionManager?.newSession === 'function') {
      sessionManager.newSession(previousState.file ? { parentSession: previousState.file } : undefined)
      materialized = true
    }
  } catch (error) {
    warning = error instanceof Error ? error.message : String(error)
  }

  const id = normalizeRewindString(sessionManager?.getSessionId?.())
  const file = normalizeRewindString(sessionManager?.getSessionFile?.())
  return {
    materialized,
    sessionChanged: Boolean(beforeId && id && beforeId !== id),
    id,
    file,
    ...(warning ? { warning } : {}),
  }
}

function describeRewindTarget(targetLeafId: string | null, cleanResult: CleanRewindResult): string {
  const target = targetLeafId ? `leaf ${targetLeafId}` : 'session root'
  if (!cleanResult.materialized) {
    return target
  }
  if (cleanResult.sessionChanged && cleanResult.id) {
    return `${target} in clean session ${cleanResult.id}`
  }
  return `${target} in clean session`
}

function collectAbandonedRewindEntries(previousBranch: any[], targetLeafId: string | null): any[] {
  if (!Array.isArray(previousBranch) || previousBranch.length === 0) {
    return []
  }
  if (!targetLeafId) {
    return previousBranch
  }
  const targetIndex = previousBranch.findIndex((entry) => entry?.id === targetLeafId)
  return targetIndex >= 0 ? previousBranch.slice(targetIndex + 1) : previousBranch
}

async function syncRewindProjection(
  interactive: any,
  runtime: any,
  input: {
    previousState: RewindSessionState
    cleanResult: CleanRewindResult
    abandonedEntries: any[]
  },
): Promise<void> {
  if (input.cleanResult.warning) {
    interactive.showWarning?.(`Clean rewind history materialization skipped: ${input.cleanResult.warning}`)
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
    interactive.showWarning?.(`Pod rewind projection unavailable: ${message}`)
  }
}

function resolveRewindSessionCreatedAt(sessionManager: any): Date | undefined {
  const headerTimestamp = normalizeRewindString(sessionManager?.getHeader?.()?.timestamp)
  const headerDate = toValidRewindDate(headerTimestamp)
  if (headerDate) {
    return headerDate
  }

  const entries = Array.isArray(sessionManager?.getEntries?.()) ? sessionManager.getEntries() : []
  for (const entry of entries) {
    const timestamp = normalizeRewindString(entry?.timestamp)
    const date = toValidRewindDate(timestamp)
    if (date) {
      return date
    }
  }

  const sessionId = normalizeRewindString(sessionManager?.getSessionId?.())
  return sessionId ? parseRewindDateFromSessionId(sessionId) ?? undefined : undefined
}

function parseRewindDateFromSessionId(sessionId: string): Date | null {
  const prefix = sessionId.replace(/-/g, '').slice(0, 12)
  if (!/^[\da-f]{12}$/i.test(prefix)) {
    return null
  }
  const millis = Number.parseInt(prefix, 16)
  if (!Number.isFinite(millis) || millis <= 0) {
    return null
  }
  return toValidRewindDate(millis)
}

function toValidRewindDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function normalizeRewindString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function syncAgentStateFromSessionManager(session: any, sessionManager: any): void {
  const context = sessionManager.buildSessionContext?.()
  if (!context || !session?.agent?.state) {
    return
  }
  if (Array.isArray(context.messages)) {
    session.agent.state.messages = context.messages
  }
}

function refreshInteractiveTranscriptFromSessionManager(interactive: any): void {
  try {
    if (typeof interactive?.rebuildChatFromMessages === 'function') {
      interactive.rebuildChatFromMessages()
      return
    }
    if (typeof interactive?.renderInitialMessages === 'function') {
      interactive.chatContainer?.clear?.()
      interactive.renderInitialMessages()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    interactive?.showWarning?.(`Rewind transcript refresh failed: ${message}`)
  }
}

interface LinxRewindMessageItem {
  id: string
  text: string
}

function collectRewindUserMessages(_session: any, sessionManager: any): LinxRewindMessageItem[] {
  return getActiveSessionBranch(sessionManager)
    .filter((entry) => entry?.type === 'message' && entry.message?.role === 'user')
    .map((entry) => ({
      id: String(entry.id),
      text: extractRewindMessageText(entry.message?.content) || '(empty user message)',
    }))
}

function extractRewindMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .filter((part): part is { type: string; text?: unknown } => typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text')
    .map((part) => typeof part.text === 'string' ? part.text : '')
    .join('')
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
