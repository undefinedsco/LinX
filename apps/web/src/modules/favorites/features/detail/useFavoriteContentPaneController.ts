import { useCallback, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { FavoriteRow } from '@undefineds.co/models'
import { useFavoriteStore } from '../../app/store'
import { useFavoriteList, useFavoriteMutations, useFavoriteSourceStatus } from '../../data/collections'
import { favoriteGroupOf } from '../../domain/groups'
import { resolveFavoriteScene } from '../../domain/scene-restore'
import { useResolveFavoriteDisplay } from '../display'
import { undoToastAction } from '../../ui/UndoToastAction'
import { useToast } from '@/components/ui/use-toast'
import { useCardDialog } from '@/lib/card-dialog'
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
  const resolveDisplay = useResolveFavoriteDisplay()
  const { removeFavorite, restoreFavorite } = useFavoriteMutations()
  const { toast } = useToast()
  const openCard = useCardDialog((s) => s.open)
  const navigate = useNavigate()

  const favorite = useMemo(() => {
    if (!selectedFavoriteId || !favorites) return null
    return favorites.find((f) => f.id === selectedFavoriteId) ?? null
  }, [selectedFavoriteId, favorites])

  const sourceStatus = useFavoriteSourceStatus(
    favorite ? ((favorite as { targetUri?: string | null }).targetUri ?? null) : null,
  )

  const handleRemove = useCallback(async () => {
    if (!favorite) return
    const removed = favorite
    await removeFavorite.mutateAsync(removed.id)
    select(null)
    // No confirm dialog: only the bookmark goes away (never the original), and it can be put back.
    toast({
      description: '已取消收藏',
      action: undoToastAction(() => {
        void restoreFavorite.mutateAsync(removed).then(() => select(removed.id))
      }),
    })
  }, [favorite, removeFavorite, restoreFavorite, select, toast])

  const handleOpenSource = useCallback(() => {
    if (!favorite) return
    if (favoriteGroupOf(favorite) === 'cards') {
      const uri = (favorite as { targetUri?: string | null }).targetUri ?? favorite.sourceId
      if (uri) openCard({ uri, from: 'favorites' })
      return
    }
    const scene = resolveFavoriteScene(favorite)
    if (!scene) return

    if (scene.microAppId === 'chat') {
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

    if (scene.microAppId === 'contacts' && scene.contactId) {
      selectContact(scene.contactId)
    }

    if (scene.microAppId === 'files') {
      if (scene.treeNodeId) {
        selectTreeNode(scene.treeNodeId)
      }
      if (scene.fileId) {
        selectFile(scene.fileId)
      }
    }

    navigate({
      to: '/$microAppId',
      params: { microAppId: scene.microAppId },
    })
  }, [favorite, navigate, openCard, selectChat, selectContact, selectFile, selectThread, selectTreeNode, setMessageAnchor])

  return {
    favorite: (favorite ? resolveDisplay(favorite) : null) as FavoriteRow | null,
    sourceStatus,
    onRemove: handleRemove,
    onOpenSource: handleOpenSource,
  }
}
