import type { RememberStatus } from './useRememberMessage'
import { useCardDialog } from '@/lib/card-dialog'

/** The quiet line under a message after pressing 记住 (W3b ①–④). */
export function RememberStrip({ status, onUndo, onRetry }: {
  status: RememberStatus
  onUndo: () => void
  onRetry: () => void
}) {
  const open = useCardDialog((state) => state.open)
  if (status.kind === 'idle') return null
  const link = 'text-primary hover:underline'
  return (
    <p role="status" className="flex max-w-[440px] flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
      {status.kind === 'saving' ? <span>正在记住…</span> : null}
      {status.kind === 'remembered' ? (
        <>
          <span>记住了：{status.text}</span>
          <button type="button" className={link} onClick={() => open({ uri: status.noteUri, from: 'chat' })}>查看</button>
          <button type="button" className={link} onClick={onUndo}>撤销</button>
        </>
      ) : null}
      {status.kind === 'replaced' ? (
        <>
          <span>已更新：{status.text}（原来是“{status.before}”）</span>
          <button type="button" className={link} onClick={onUndo}>撤销</button>
        </>
      ) : null}
      {status.kind === 'already' ? (
        <>
          <span>已经记过了</span>
          <button type="button" className={link} onClick={() => open({ uri: status.noteUri, from: 'chat' })}>查看</button>
        </>
      ) : null}
      {status.kind === 'failed' ? (
        <>
          <span>
            没记住，这次的修改不受影响
            {status.reason === 'forbidden' ? '（没有权限写入）' : status.reason === 'offline' ? '（没有网络）' : ''}
          </span>
          <button type="button" className={link} onClick={onRetry}>重试</button>
        </>
      ) : null}
    </p>
  )
}
