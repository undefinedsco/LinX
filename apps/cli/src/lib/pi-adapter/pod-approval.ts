import type { BeforeToolCallContext, BeforeToolCallResult } from '@mariozechner/pi-agent-core'
import type { AgentSession } from '@mariozechner/pi-coding-agent'

export interface LinxPiRemoteApprovalOptions {
  session: AgentSession
  cwd: string
  pollMs?: number
  runtime?: unknown
}

export function installLinxPiRemoteApproval(options: LinxPiRemoteApprovalOptions): void {
  const agent = options.session.agent
  const originalBeforeToolCall = agent.beforeToolCall?.bind(agent)

  agent.beforeToolCall = async (context: BeforeToolCallContext, signal?: AbortSignal) => {
    return originalBeforeToolCall?.(context, signal)
  }
}
