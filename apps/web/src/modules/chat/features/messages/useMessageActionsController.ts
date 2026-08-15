import { useEffect, useMemo, useState } from 'react'
import type { MessageRow } from '@undefineds.co/models'
import type { ThreadItem } from '@/lib/vendor/xpod-chatkit'
import type { ConversationSurfacePort, WorkbenchCommandBus } from '../../domain/conversation-workbench'
import { readMessageBranchMetadata } from '../../domain/message-row-adapter'
import { cycleSibling, groupMessageSiblings, selectSiblingIndex } from '../../domain/message-tree'
import {
  createMessageDeleteConfirmation,
  createMessageQuoteDraft,
  projectActionableMessages,
  selectActionableMessage,
} from '../../domain/message-actions'

interface UseMessageActionsControllerOptions {
  messageRows: readonly MessageRow[]
  threadItems: readonly ThreadItem[]
  persistedActiveBranchByParent?: Record<string, string>
  localActiveBranchByParent: Record<string, string>
  setActiveBranch: (parentId: string, itemId: string) => void
  commands: WorkbenchCommandBus
  surface: ConversationSurfacePort
  refreshMessages: () => Promise<unknown>
  refreshThreadItems: () => Promise<unknown>
}

function assistantText(item: ThreadItem): string {
  if (item.type !== 'assistant_message') return ''
  return item.content.flatMap((part) => part.type === 'output_text' ? [part.text] : []).join('\n').trim()
}

export function useMessageActionsController({
  messageRows,
  threadItems,
  persistedActiveBranchByParent,
  localActiveBranchByParent,
  setActiveBranch,
  commands,
  surface,
  refreshMessages,
  refreshThreadItems,
}: UseMessageActionsControllerOptions) {
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [pendingRegenerateParentId, setPendingRegenerateParentId] = useState<string | null>(null)

  const userMessages = useMemo(() => {
    const byId = new Map(messageRows.filter((message) => message.role === 'user').map((message) => {
      let itemId = message.id
      if (typeof message.richContent === 'string') {
        try {
          const stored = JSON.parse(message.richContent) as { id?: unknown }
          if (typeof stored.id === 'string') itemId = stored.id
        } catch {
          // Legacy plain-text messages keep their Pod row id.
        }
      }
      return [itemId, { ...message, id: itemId }]
    }))
    for (const item of threadItems) {
      if (item.type !== 'user_message') continue
      byId.set(item.id, {
        id: item.id,
        role: 'user',
        content: item.content.filter((part) => part.type === 'input_text').map((part) => part.text).join('\n'),
        richContent: JSON.stringify(item),
        createdAt: new Date(item.created_at * 1000),
      } as MessageRow)
    }
    return [...byId.values()].sort((left, right) => new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime())
  }, [messageRows, threadItems])

  const items = useMemo(() => projectActionableMessages(
    userMessages,
    threadItems.filter((item) => item.type === 'assistant_message').map((item) => ({
      id: item.id,
      content: assistantText(item),
      createdAt: new Date(item.created_at * 1000),
    })),
  ), [threadItems, userMessages])
  const selectedItem = selectActionableMessage(items, selectedMessageId)
  const selectedUserMessage = selectedItem?.role === 'user'
    ? userMessages.find((message) => message.id === selectedItem.id)
    : undefined

  const branchGroups = useMemo(() => groupMessageSiblings(userMessages.map((row) => ({
    id: row.id,
    ...readMessageBranchMetadata(row),
    createdAt: row.createdAt,
  }))), [userMessages])
  const activeBranchByParent = useMemo(() => ({
    ...(persistedActiveBranchByParent ?? {}),
    ...localActiveBranchByParent,
  }), [localActiveBranchByParent, persistedActiveBranchByParent])
  const persistedActionMessage = useMemo(() => [...userMessages].reverse()
    .find((message) => Object.values(activeBranchByParent).includes(message.id)), [activeBranchByParent, userMessages])
  const messageBranchGroup = useMemo(() => {
    if (!selectedUserMessage) return null
    const metadata = readMessageBranchMetadata(selectedUserMessage)
    return branchGroups.find((group) => group.items.some((item) => item.id === selectedUserMessage.id))
      ?? (metadata.parentItemId ? branchGroups.find((group) => group.parentItemId === metadata.parentItemId) : null)
  }, [branchGroups, selectedUserMessage])
  const messageBranchIndex = messageBranchGroup?.items.findIndex((item) => item.id === selectedUserMessage?.id) ?? -1

  const answerBranchGroup = useMemo(() => {
    if (!selectedUserMessage) return null
    const canonicalUserId = (parentId: string | undefined) => {
      if (!parentId) return parentId
      const parentFragment = parentId.includes('#') ? parentId.slice(parentId.lastIndexOf('#') + 1) : parentId
      return userMessages.find((message) => {
        const fragment = message.id.includes('#') ? message.id.slice(message.id.lastIndexOf('#') + 1) : message.id
        return message.id === parentId || fragment === parentFragment
      })?.id ?? parentId
    }
    const answerNodes = threadItems.filter((item) => item.type === 'assistant_message').map((item) => ({
      id: item.id,
      parentItemId: typeof (item as ThreadItem & { parent_item_id?: unknown }).parent_item_id === 'string'
        ? canonicalUserId((item as ThreadItem & { parent_item_id: string }).parent_item_id)
        : undefined,
      branchId: typeof (item as ThreadItem & { branch_id?: unknown }).branch_id === 'string'
        ? (item as ThreadItem & { branch_id: string }).branch_id
        : undefined,
      createdAt: new Date(item.created_at * 1000),
    }))
    return groupMessageSiblings(answerNodes).find((group) => group.parentItemId === selectedUserMessage.id) ?? null
  }, [selectedUserMessage, threadItems, userMessages])
  const activeAnswerId = selectedUserMessage ? activeBranchByParent[selectedUserMessage.id] : undefined
  const answerBranchIndex = answerBranchGroup ? selectSiblingIndex(answerBranchGroup, activeAnswerId) : -1

  useEffect(() => {
    for (const [parentId, itemId] of Object.entries(persistedActiveBranchByParent ?? {})) setActiveBranch(parentId, itemId)
  }, [persistedActiveBranchByParent, setActiveBranch])
  useEffect(() => {
    if (!answerBranchGroup || !selectedUserMessage || pendingRegenerateParentId !== selectedUserMessage.id) return
    const newestAnswer = answerBranchGroup.items[answerBranchGroup.items.length - 1]
    if (!newestAnswer) return
    setActiveBranch(selectedUserMessage.id, newestAnswer.id)
    setPendingRegenerateParentId(null)
  }, [answerBranchGroup, pendingRegenerateParentId, selectedUserMessage, setActiveBranch])
  useEffect(() => {
    if (persistedActionMessage && selectedMessageId !== persistedActionMessage.id && Object.keys(localActiveBranchByParent).length === 0) {
      setSelectedMessageId(persistedActionMessage.id)
      return
    }
    if (!selectedMessageId && (persistedActionMessage || selectedItem)) setSelectedMessageId((persistedActionMessage ?? selectedItem)?.id ?? null)
    if (selectedMessageId && !items.some((message) => message.id === selectedMessageId)) setSelectedMessageId(selectedItem?.id ?? null)
  }, [items, localActiveBranchByParent, persistedActionMessage, selectedItem, selectedMessageId])

  const selectBranch = (kind: 'message' | 'answer', direction: -1 | 1) => {
    if (!selectedUserMessage) return
    const group = kind === 'message' ? messageBranchGroup : answerBranchGroup
    if (!group) return
    const currentId = kind === 'message' ? selectedUserMessage.id : activeAnswerId
    const nextId = cycleSibling(group, currentId, direction)
    if (!nextId) return
    const parentId = kind === 'message' ? group.parentItemId ?? 'root' : selectedUserMessage.id
    setActiveBranch(parentId, nextId)
    if (kind === 'message') setSelectedMessageId(nextId)
    void commands.selectBranch(nextId, parentId).then(() => surface.refresh())
  }

  const regenerate = async () => {
    if (!selectedUserMessage) return
    setPendingRegenerateParentId(selectedUserMessage.id)
    try {
      await commands.regenerateMessage(selectedUserMessage.id)
    } catch {
      setPendingRegenerateParentId(null)
    } finally {
      await Promise.allSettled([surface.refresh(), refreshThreadItems()])
    }
  }
  const submitEdit = async () => {
    if (!editingMessage) return
    try {
      await commands.editMessage(editingMessage.id, editingMessage.text)
    } catch {
      // The adapter reports protocol failures through ChatKit's error callback.
    } finally {
      setEditingMessage(null)
      setSelectedMessageId(null)
      await Promise.allSettled([surface.refresh(), refreshMessages(), refreshThreadItems()])
    }
  }
  const deleteSelected = async () => {
    if (!selectedItem || !window.confirm(createMessageDeleteConfirmation(selectedItem))) return
    try {
      await commands.deleteMessage(selectedItem.id)
    } catch {
      // The adapter reports protocol failures through ChatKit's error callback.
    } finally {
      setSelectedMessageId(null)
      await Promise.allSettled([surface.refresh(), refreshMessages()])
    }
  }

  return {
    items,
    selectedItem,
    selectedUserMessage,
    editingMessage,
    setEditingText: (text: string) => setEditingMessage((current) => current ? { ...current, text } : current),
    closeEditor: () => setEditingMessage(null),
    startEditing: () => {
      if (selectedUserMessage) setEditingMessage({ id: selectedUserMessage.id, text: selectedUserMessage.content ?? '' })
    },
    selectMessage: setSelectedMessageId,
    messageBranch: messageBranchGroup && messageBranchGroup.items.length > 1
      ? { index: messageBranchIndex, count: messageBranchGroup.items.length }
      : undefined,
    answerBranch: answerBranchGroup && answerBranchGroup.items.length > 1
      ? { index: answerBranchIndex, count: answerBranchGroup.items.length }
      : undefined,
    previousMessageBranch: () => selectBranch('message', -1),
    nextMessageBranch: () => selectBranch('message', 1),
    previousAnswerBranch: () => selectBranch('answer', -1),
    nextAnswerBranch: () => selectBranch('answer', 1),
    quoteSelected: () => selectedItem ? surface.setDraft({ text: createMessageQuoteDraft(selectedItem) }) : Promise.resolve(),
    regenerate,
    submitEdit,
    deleteSelected,
  }
}
