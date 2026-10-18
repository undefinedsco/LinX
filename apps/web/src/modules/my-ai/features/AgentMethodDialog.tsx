import { Suspense, lazy } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMyAIStore } from '../app/store'

const AgentMethodDialogBody = lazy(() =>
  import('./AgentMethodDialogBody').then((mod) => ({ default: mod.AgentMethodDialogBody })),
)

/**
 * The single place to edit how an assistant works. Mounted once in the shell;
 * `useOpenAgentMethod()` opens it from chat info and contact details.
 */
export function AgentMethodDialogHost() {
  const agentId = useMyAIStore((state) => state.methodDialogAgentId)
  const close = useMyAIStore((state) => state.closeMethodDialog)

  return (
    <Dialog open={agentId !== null} onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent
        data-testid="agent-method-dialog"
        className="flex h-[min(720px,calc(100dvh-48px))] w-[min(720px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">做事的方法</DialogTitle>
        <DialogDescription className="sr-only">这个助手每次做事都会按这里来</DialogDescription>
        {agentId ? (
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/10" />}>
            <AgentMethodDialogBody agentId={agentId} />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
