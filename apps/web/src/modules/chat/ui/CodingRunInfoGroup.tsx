import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { GrantsView } from '@/modules/inbox'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { codingToolName, folderDisplayName, formatModelUsage, formatRunDuration } from '../domain/coding-run'
import { fetchRuntimeSessionLog, type RuntimeSessionRecord } from '../runtime-client'
import { InfoGroup, InfoRow } from './ChatInfoParts'

/** W10: 这次运行 — tool, folder, time, usage, what was allowed, copy the log. */
export function CodingRunInfoGroup({ session, agentId }: { session: RuntimeSessionRecord; agentId: string | null }) {
  const { toast } = useToast()
  const [grantsOpen, setGrantsOpen] = useState(false)
  const folder = folderDisplayName(session.folderPath, session.repoPath, session.container)

  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(await fetchRuntimeSessionLog(session.id))
      toast({ description: '运行日志已复制。' })
    } catch (error) {
      toast({ description: formatLoginErrorForUser(error, '没能复制运行日志，请稍后再试。'), variant: 'destructive' })
    }
  }

  return (
    <>
      <InfoGroup title="这次运行">
        <InfoRow label="工具" value={codingToolName(session.tool)} />
        <InfoRow label="文件夹" value={folder ?? '未知'} />
        <InfoRow label="已经运行" value={formatRunDuration(session.createdAt)} />
        <InfoRow label="用量" value={formatModelUsage(session.tokenUsage)} last />
      </InfoGroup>
      <InfoGroup title="许可">
        <InfoRow label="这次允许过的命令" onClick={() => setGrantsOpen(true)} hint="可以在这里收回" />
        <InfoRow label="复制运行日志" onClick={() => { void copyLog() }} last />
      </InfoGroup>
      <Dialog open={grantsOpen} onOpenChange={setGrantsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>这次允许过的命令</DialogTitle>
            <DialogDescription>不想再自动放行的，在这里收回。</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <GrantsView agentId={agentId ?? undefined} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
