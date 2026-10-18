import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { ContactType, type ChatRow, type ContactRow } from '@undefineds.co/models'
import { useBrowserOnline } from '@/lib/use-browser-online'
import { contactCollection, contactOps } from '@/modules/contacts'
import {
  useFileNameSearch,
  useOpenFileEntry,
  type FileNameSearchEntry,
} from '@/modules/files/features/search/file-name-search'
import { useFilesBodySearch, useOpenBodyHit, type FilesBodyHit } from '@/modules/files/features/search/useFilesBodySearch'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { useFilesStore } from '@/modules/files/app/store'
import { useChatStore } from '../../store'
import { useChatList } from '../../collections'

const SECTION_LIMIT = 5
const NAME_HIT_LIMIT = 4
const BODY_HIT_LIMIT = 3

export interface GlobalSearchChatHit { id: string; title: string; preview: string | null }
export interface GlobalSearchContactHit { id: string; name: string; kind: 'person' | 'assistant' | 'group' }

function matches(value: string | null | undefined, term: string): boolean {
  return typeof value === 'string' && value.toLocaleLowerCase().includes(term)
}

/**
 * WeChat-style search from the list column: conversations,
 * contacts and groups, and file names — each source says what it covered.
 */
export function useGlobalSearch(query: string) {
  const term = query.trim().toLocaleLowerCase()
  const active = term.length > 0
  const navigate = useNavigate()
  const selectChat = useChatStore((state) => state.selectChat)
  const isOnline = useBrowserOnline()
  const { data: chatRows = [] } = useChatList(active ? { search: query } : undefined)
  const contactQuery = useLiveQuery(contactCollection)
  const fileSearch = useFileNameSearch(isOnline ? query : '')
  const openFileEntry = useOpenFileEntry()
  const bodySearch = useFilesBodySearch(query)
  const openBodyHit = useOpenBodyHit()
  const [openError, setOpenError] = useState<string | null>(null)

  const chats = useMemo<GlobalSearchChatHit[]>(() => (
    active
      ? (chatRows as ChatRow[])
          .filter((row) => typeof row.id === 'string')
          .slice(0, SECTION_LIMIT)
          .map((row) => ({ id: row.id as string, title: row.title || '未命名会话', preview: row.lastMessagePreview ?? null }))
      : []
  ), [active, chatRows])

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

  // Files found by name first; then files whose text matched (a file found both ways shows once).
  const bodyOnlyHits = useMemo<FilesBodyHit[]>(() => {
    const byName = new Set(fileSearch.results.map((entry) => entry.uri))
    return bodySearch.hits.filter((hit) => !byName.has(hit.uri))
  }, [bodySearch.hits, fileSearch.results])
  const files = useMemo(() => fileSearch.results.slice(0, NAME_HIT_LIMIT), [fileSearch.results])
  const bodyFiles = useMemo(() => bodyOnlyHits.slice(0, BODY_HIT_LIMIT), [bodyOnlyHits])

  const openChat = useCallback((chatId: string) => selectChat(chatId), [selectChat])
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
    contacts,
    files,
    bodyFiles,
    fileSearch: {
      isLoading: fileSearch.isLoading,
      isError: fileSearch.isError,
      total: fileSearch.results.length + bodyOnlyHits.length,
      shown: files.length + bodyFiles.length,
      coverageNote: bodySearch.note,
      retry: fileSearch.retry,
    },
    isEmpty: chats.length + contacts.length + files.length + bodyFiles.length === 0 && !fileSearch.isLoading,
    openError,
    openChat,
    openContact,
    openFile,
    openBodyHit,
    viewAllFiles,
  }
}
