import { ToastAction } from '@/components/ui/toast'

/** The 「撤销」 button of the 「已取消收藏」 toast (K7b: no confirm dialog, undo instead). */
export function undoToastAction(onUndo: () => void) {
  return (
    <ToastAction altText="撤销取消收藏" onClick={onUndo}>
      撤销
    </ToastAction>
  )
}
