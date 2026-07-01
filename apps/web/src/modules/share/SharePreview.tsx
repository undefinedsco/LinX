import type { SharePreviewModel } from './share-contract'

export function SharePreview({
  preview,
  onCopy,
  onShowQr,
}: {
  preview: SharePreviewModel
  onCopy: (url: string) => void
  onShowQr: (payload: string) => void
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">分享链接</h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {preview.storageLabel}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{preview.hint}</p>
      <p className="mt-3 break-all rounded-xl bg-muted/35 px-3 py-2 font-mono text-xs text-foreground">
        {preview.linkUrl}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onCopy(preview.linkUrl)}
          className="h-9 rounded-lg bg-primary text-sm font-medium text-primary-foreground"
        >
          复制链接
        </button>
        <button
          type="button"
          onClick={() => onShowQr(preview.qrPayload)}
          className="h-9 rounded-lg border border-border text-sm font-medium text-foreground"
        >
          二维码
        </button>
      </div>
    </section>
  )
}
