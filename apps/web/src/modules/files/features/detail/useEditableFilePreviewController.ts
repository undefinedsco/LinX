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
  const openRequestUri = useFilesStore((state) => state.editableFileSheetOpenRequestUri)
  const consumeOpenRequest = useFilesStore((state) => state.consumeEditableFileSheetOpenRequest)

  const openSheet = useCallback(() => {
    onOpenSheet?.()
    setSheetOpen(true)
  }, [onOpenSheet])

  const handlePreviewKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openSheet()
  }, [openSheet])

  useEffect(() => {
    if (openRequestUri !== fileUri) return
    openSheet()
    consumeOpenRequest(fileUri)
  }, [consumeOpenRequest, fileUri, openRequestUri, openSheet])

  return {
    handlePreviewKeyDown,
    openSheet,
    setSheetOpen,
    sheetOpen,
  }
}
