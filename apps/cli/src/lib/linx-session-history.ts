export type LinxSessionRetryTurn = {
  continueFromId?: string | null
  promptText?: string
  promptParentId?: string | null
}

type SessionHistoryEntry = {
  id: string
  parentId?: string | null
  message: unknown
}

export function captureLinxSessionRetryTurn(session: any): LinxSessionRetryTurn {
  const sessionManager = session?.sessionManager
  const leafId = typeof sessionManager?.getLeafId === 'function'
    ? sessionManager.getLeafId()
    : undefined
  const leafEntry = leafId && typeof sessionManager?.getEntry === 'function'
    ? sessionManager.getEntry(leafId)
    : undefined
  const leafMessage = leafEntry?.type === 'message' ? leafEntry.message : undefined
  const userEntry = findLastUserMessageEntry(sessionManager, leafId)
  const promptText = extractUserMessageText(userEntry?.message)
    ?? extractUserMessageText(leafMessage)
    ?? findLastUserMessageText(session?.state?.messages)

  return {
    continueFromId: userEntry?.id ?? (leafMessage?.role === 'user' ? leafId : undefined),
    promptText,
    promptParentId: userEntry?.parentId ?? (leafMessage?.role === 'user' ? normalizeParentId(leafEntry.parentId) : undefined),
  }
}

export function restoreLinxSessionHistoryBranch(session: any, leafId: string | null | undefined): void {
  const sessionManager = session?.sessionManager
  if (!sessionManager) {
    return
  }

  if (typeof leafId === 'string' && leafId) {
    sessionManager.branch?.(leafId)
  } else if (leafId === null) {
    sessionManager.resetLeaf?.()
  }

  const context = sessionManager.buildSessionContext?.()
  if (context?.messages && session.agent?.state) {
    session.agent.state.messages = context.messages
  }
}

function findLastUserMessageText(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) {
    return undefined
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = extractUserMessageText(messages[index])
    if (text) {
      return text
    }
  }
  return undefined
}

function findLastUserMessageEntry(
  sessionManager: any,
  leafId: unknown,
): SessionHistoryEntry | undefined {
  const branch = typeof sessionManager?.getBranch === 'function' && typeof leafId === 'string'
    ? sessionManager.getBranch(leafId)
    : undefined
  const entries = Array.isArray(branch) && branch.length > 0
    ? branch
    : typeof sessionManager?.getEntries === 'function'
      ? sessionManager.getEntries()
      : []

  if (!Array.isArray(entries)) {
    return undefined
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (
      isRecord(entry)
      && entry.type === 'message'
      && typeof entry.id === 'string'
      && isRecord(entry.message)
      && entry.message.role === 'user'
    ) {
      return {
        id: entry.id,
        parentId: normalizeParentId(entry.parentId),
        message: entry.message,
      }
    }
  }

  return undefined
}

function normalizeParentId(parentId: unknown): string | null | undefined {
  if (typeof parentId === 'string') {
    return parentId
  }
  if (parentId === null) {
    return null
  }
  return undefined
}

function extractUserMessageText(message: unknown): string | undefined {
  if (!isRecord(message) || message.role !== 'user') {
    return undefined
  }

  const content = message.content
  if (typeof content === 'string') {
    return content.trim() || undefined
  }
  if (!Array.isArray(content)) {
    return undefined
  }

  const text = content
    .filter((entry): entry is { type: string; text: string } => (
      isRecord(entry) && entry.type === 'text' && typeof entry.text === 'string'
    ))
    .map((entry) => entry.text)
    .join('')
    .trim()
  return text || undefined
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object'
}
