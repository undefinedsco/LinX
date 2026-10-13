import { useMyAgents } from '../data/agents'
import { MethodEditor } from './MethodEditor'

export function AgentMethodDialogBody({ agentId }: { agentId: string }) {
  const { agents, isLoading } = useMyAgents()
  const agent = agents.find((item) => item.id === agentId)

  if (agent) return <MethodEditor agent={agent} inDialog />
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {isLoading ? '正在读取助手…' : '这个助手已经不在了'}
    </div>
  )
}
