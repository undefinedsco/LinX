import { useCallback, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { FavoriteRow } from '@undefineds.co/models'
import { useFavoriteStore } from '../../app/store'
import { useFavoriteList, useFavoriteMutations } from '../../data/collections'
import { resolveFavoriteScene } from '../../domain/scene-restore'
import { useChatStore } from '@/modules/chat/store'
import { useContactStore } from '@/modules/contacts/app/store'
import { useFilesStore } from '@/modules/files/store'

export function useFavoriteContentPaneController() {
  const selectedFavoriteId = useFavoriteStore((s) => s.selectedFavoriteId)
  const select = useFavoriteStore((s) => s.select)
  const selectChat = useChatStore((s) => s.selectChat)
  const selectThread = useChatStore((s) => s.selectThread)
  const setMessageAnchor = useChatStore((s) => s.setMessageAnchor)
  const selectContact = useContactStore((s) => s.select)
  const selectFile = useFilesStore((s) => s.selectFile)
  const selectTreeNode = useFilesStore((s) => s.selectTreeNode)
  const { data: favorites } = useFavoriteList()
  const { removeFavorite } = useFavoriteMutations()
  const navigate = useNavigate()

  const favorite = useMemo(() => {
    if (!selectedFavoriteId || !favorites) return null
    return favorites.find((f) => f.id === selectedFavoriteId) ?? null
  }, [selectedFavoriteId, favorites])

  const handleRemove = useCallback(async () => {
    if (!favorite) return
    await removeFavorite.mutateAsync(favorite.id)
    select(null)
  }, [favorite, removeFavorite, select])

  const handleOpenSource = useCallback(() => {
    if (!favorite) return
    const scene = resolveFavoriteScene(favorite)
    if (!scene) return

    if (scene.appletId === 'chat') {
      if (scene.chatId) {
        selectChat(scene.chatId)
      }
      if (scene.threadId) {
        selectThread(scene.threadId)
      }
      setMessageAnchor(scene.messageId ?? null)
    } else {
      setMessageAnchor(null)
    }

    if (scene.appletId === 'contacts' && scene.contactId) {
      selectContact(scene.contactId)
    }

    if (scene.appletId === 'files') {
      if (scene.treeNodeId) {
        selectTreeNode(scene.treeNodeId)
      }
      if (scene.fileId) {
        selectFile(scene.fileId)
      }
    }

    navigate({
      to: '/$appletId',
      params: { appletId: scene.appletId },
    })
  }, [favorite, navigate, selectChat, selectContact, selectFile, selectThread, selectTreeNode, setMessageAnchor])

  return {
    favorite: favorite as FavoriteRow | null,
    onRemove: handleRemove,
    onOpenSource: handleOpenSource,
  }
}
