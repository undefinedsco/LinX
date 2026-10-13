import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { ContactType, type ChatRow, type ContactRow, type ThreadRow } from '@undefineds.co/models'
import { resolveThreadChatId } from '@/lib/data/resource-identity'
import { useBrowserOnline } from '@/lib/use-browser-online'
import { contactCollection, contactOps } from '@/modules/contacts'
import {
  useFileNameSearch,
  useOpenFileEntry,
  type FileNameSearchEntry,
} from '@/modules/files/features/search/file-name-search'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { useFilesStore } from '@/modules/files/app/store'
import { useChatStore } from '../../store'
import { useChatList, useThreadIndex } from '../../collections'

const SECTION_LIMIT = 5

export interface GlobalSearchChatHit { id: string; title: string; preview: string | null }
export interface GlobalSearchTopicHit { id: string; chatId: string; title: string; chatTitle: string | null }
export interface GlobalSearchContactHit { id: string; name: string; kind: 'person' | 'assistant' | 'group' }

function matches(value: string | null | undefined, term: string): boolean {
  return typeof value === 'string' && value.toLocaleLowerCase().includes(term)
}

/**
 * WeChat-style search from the list column: conversations and topics,
 * contacts and groups, and file names — each source says what it covered.
 */
export function useGlobalSearch(query: string) {
  const term = query.trim().toLocaleLowerCase()
  const active = term.length > 0
  const navigate = useNavigate()
  const selectChat = useChatStore((state) => state.selectChat)
  const selectThread = useChatStore((state) => state.selectThread)
  const isOnline = useBrowserOnline()
  const { data: chatRows = [] } = useChatList(active ? { search: query } : undefined)
  const { data: allChats = [] } = useChatList()
  const { data: threadRows = [] } = useThreadIndex({ enabled: active })
  const contactQuery = useLiveQuery(contactCollection)
  const fileSearch = useFileNameSearch(isOnline ? query : '')
  const openFileEntry = useOpenFileEntry()
  const [openError, setOpenError] = useState<string | null>(null)

  const chats = useMemo<GlobalSearchChatHit[]>(() => (
    active
      ? (chatRows as ChatRow[])
          .filter((row) => typeof row.id === 'string')
          .slice(0, SECTION_LIMIT)
          .map((row) => ({ id: row.id as string, title: row.title || '未命名会话', preview: row.lastMessagePreview ?? null }))
      : []
  ), [active, chatRows])

  const topics = useMemo<GlobalSearchTopicHit[]>(() => {
    if (!active) return []
    const titlesByChat = new Map((allChats as ChatRow[]).map((row) => [row.id, row.title ?? null]))
    return (threadRows as ThreadRow[])
      .filter((row) => typeof row.id === 'string' && matches(row.title, term))
      .map((row) => {
        const chatId = resolveThreadChatId(row as unknown as Parameters<typeof resolveThreadChatId>[0])
        return chatId
          ? { id: row.id as string, chatId, title: row.title as string, chatTitle: titlesByChat.get(chatId) ?? null }
          : null
      })
      .filter((hit): hit is GlobalSearchTopicHit => hit !== null)
      .slice(0, SECTION_LIMIT)
  }, [active, allChats, term, threadRows])

  const contacts = useMemo<GlobalSearchContactHit[]>(() => (
    active
      ? ((contactQuery.data ?? []) as ContactRow[])
          .filter((row) => matches(row.alias, term) || matches(row.name, term))
          .slice(0, SECTION_LIMIT)
          .map((row) => ({
            id: row.id,
            name: row.alias || row.name || '未命名',
            kind: row.contactType === ContactType.GROUP
              ? 'group'
              : row.contactType === ContactType.AGENT ? 'assistant' : 'person',
          }))
      : []
  ), [active, contactQuery.data, term])

  const files = useMemo(() => fileSearch.results.slice(0, SECTION_LIMIT), [fileSearch.results])

  const openChat = useCallback((chatId: string) => selectChat(chatId), [selectChat])
  const openTopic = useCallback((hit: GlobalSearchTopicHit) => {
    selectChat(hit.chatId)
    selectThread(hit.id)
  }, [selectChat, selectThread])
  const openContact = useCallback(async (hit: GlobalSearchContactHit) => {
    setOpenError(null)
    try {
      const chatId = await contactOps.findOrCreateChat(hit.id)
      selectChat(chatId)
      navigate({ to: '/$microAppId', params: { microAppId: 'chat' } })
    } catch (error) {
      setOpenError(formatLoginErrorForUser(error, '没能打开这个聊天，请稍后再试。'))
    }
  }, [navigate, selectChat])
  const setFilesSearchText = useFilesStore((state) => state.setSearchText)
  const viewAllFiles = useCallback(() => {
    setFilesSearchText(query.trim())
    navigate({ to: '/$microAppId', params: { microAppId: 'files' } })
  }, [navigate, query, setFilesSearchText])
  const openFile = useCallback((entry: FileNameSearchEntry) => openFileEntry(entry), [openFileEntry])

  return {
    active,
    isOnline,
    chats,
    topics,
    contacts,
    files,
    fileSearch: {
      isLoading: fileSearch.isLoading,
      isError: fileSearch.isError,
      total: fileSearch.results.length,
      retry: fileSearch.retry,
    },
    isEmpty: chats.length + topics.length + contacts.length + files.length === 0 && !fileSearch.isLoading,
    openError,
    openChat,
    openTopic,
    openContact,
    openFile,
    viewAllFiles,
  }
}
