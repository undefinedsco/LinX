import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { displayAssistantName } from '@/lib/assistant-name'
import { agentKeyFromResourceId } from '@/lib/data/resource-identity'
import { agentCollection } from '@/modules/contacts/collections'

/** Assistant folder key -> display name; legacy stored names (LinX 主理人) show as LinX 助手. */
export function useFilesAgentNames(): Record<string, string> {
  const { data = [] } = useLiveQuery(agentCollection)
  return useMemo(() => {
    const names: Record<string, string> = {}
    for (const agent of data) {
      let key: string
      try {
        key = agentKeyFromResourceId(agent.id)
      } catch {
        key = agent.id
      }
      names[key] = displayAssistantName(agent.name)
    }
    names.__secretary__ ??= displayAssistantName(null)
    return names
  }, [data])
}
