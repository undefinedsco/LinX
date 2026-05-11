import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getRuntimeShellInfo } from '@/lib/runtime-shell'
import type { AppUpdateStatus } from '@/lib/app-release'

interface AboutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: AppUpdateStatus
  isChecking: boolean
  onCheckUpdates: () => void
  onOpenReleasePage: () => void
}

function formatCheckedAt(value: string | null) {
  if (!value) {
    return '未检查'
  }

  return new Date(value).toLocaleString('zh-CN')
}

export function AboutDialog({
  open,
  onOpenChange,
  status,
  isChecking,
  onCheckUpdates,
  onOpenReleasePage,
}: AboutDialogProps) {
  const shell = getRuntimeShellInfo()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>关于 LinX</DialogTitle>
          <DialogDescription>
            当前运行于 {shell.label} Shell，使用 {shell.authLabel}。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-border/60 bg-card/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">当前版本</span>
              <span className="font-medium text-foreground">{status.currentVersion}</span>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-card/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">更新状态</span>
              <span className={status.available ? 'font-medium text-amber-500' : 'font-medium text-foreground'}>
                {status.available && status.latestVersion
                  ? `发现新版本 ${status.latestVersion}`
                  : status.error
                  ? '检查失败'
                  : '当前已是最新版本'}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              最近检查：{formatCheckedAt(status.checkedAt)}
            </div>
            {status.error ? (
              <div className="mt-2 text-xs text-destructive">{status.error}</div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          {status.releaseUrl ? (
            <Button variant="outline" onClick={onOpenReleasePage}>
              查看发布页
            </Button>
          ) : null}
          <Button onClick={onCheckUpdates} disabled={isChecking}>
            {isChecking ? '检查中…' : '检查更新'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
