import { useCallback } from 'react'
import { useMyAIStore } from './store'

/**
 * Every place that edits an assistant's working method (聊天信息, 联系人详情)
 * opens the same method editor, in one dialog mounted on the shell. R6 drops
 * the 我的 AI page, so this never navigates.
 */
export function useOpenAgentMethod(): (agentId: string) => void {
  const openMethodDialog = useMyAIStore((state) => state.openMethodDialog)

  return useCallback((agentId: string) => {
    if (!agentId) return
    openMethodDialog(agentId)
  }, [openMethodDialog])
}
