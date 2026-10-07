import {
  emptyChatProjectContext,
  readChatProjectContext,
  reconcileChatProjectContext,
  type ChatProjectContextSnapshot,
  type ChatProjectMemoryEntry,
  type SolidDatabase,
} from '@undefineds.co/models'

export type ProjectMemoryEntry = ChatProjectMemoryEntry
export type ChatProjectContext = ChatProjectContextSnapshot

export function emptyProjectContext(workspace: string): ChatProjectContext {
  return emptyChatProjectContext(workspace)
}

export function readProjectContext(input: {
  db: SolidDatabase
  workspaceUri: string
}): Promise<ChatProjectContext> {
  return readChatProjectContext(input.db, input.workspaceUri)
}

export function writeProjectContext(input: {
  db: SolidDatabase
  previous: ChatProjectContext
  context: ChatProjectContext
}): Promise<ChatProjectContext> {
  return reconcileChatProjectContext(input.db, {
    previous: input.previous,
    next: input.context,
  })
}

export function renderProjectSystemContext(context: ChatProjectContext): string {
  const sections: string[] = []
  if (context.instructions.trim()) sections.push(`项目说明：\n${context.instructions.trim()}`)
  if (context.memoryEnabled && context.memories.length > 0) {
    sections.push(`用户明确保存的项目记忆：\n${context.memories.map((memory) => `- ${memory.text.trim()}`).join('\n')}`)
  }
  return sections.join('\n\n')
}
