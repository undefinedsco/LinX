export type AgentRuntimeCompanionTask =
  | 'turn.route'
  | 'approval.judge'
  | 'input.answer'
  | 'context.summarize'
  | 'title.generate'
  | 'retrieval.rank'

export const DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID = 'linx-lite'

export interface AgentRuntimeCompanionModelPolicy {
  modelId: string
  tasks: AgentRuntimeCompanionTask[]
}

export const DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_POLICY: AgentRuntimeCompanionModelPolicy = {
  modelId: DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID,
  tasks: [
    'turn.route',
    'approval.judge',
    'input.answer',
    'context.summarize',
    'title.generate',
    'retrieval.rank',
  ],
}
