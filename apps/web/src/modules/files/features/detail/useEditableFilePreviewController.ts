import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { useFilesStore } from '../../app/store'

export function useEditableFilePreviewController({
  fileUri,
  onOpenSheet,
}: {
  fileUri: string
  onOpenSheet?: () => void
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const openRequestUri = useFilesStore((state) => state.editableFileSheetOpenRequestUri)
  const openRequestMode = useFilesStore((state) => state.editableFileOpenRequestMode)
  const consumeOpenRequest = useFilesStore((state) => state.consumeEditableFileSheetOpenRequest)

  const openModal = useCallback(() => {
    onOpenSheet?.()
    setSheetOpen(true)
  }, [onOpenSheet])

  const startInlineEdit = useCallback(() => {
    setEditing(true)
  }, [])

  const handlePreviewKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    startInlineEdit()
  }, [startInlineEdit])

  useEffect(() => {
    if (openRequestUri !== fileUri) return
    if (openRequestMode === 'modal') openModal()
    else startInlineEdit()
    consumeOpenRequest(fileUri)
  }, [consumeOpenRequest, fileUri, openModal, openRequestMode, openRequestUri, startInlineEdit])

  return {
    editing,
    handlePreviewKeyDown,
    openModal,
    setEditing,
    setSheetOpen,
    sheetOpen,
    startInlineEdit,
  }
}
