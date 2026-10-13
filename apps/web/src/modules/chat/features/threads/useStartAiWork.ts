import { useCallback } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { useChatStore } from '../../store'
import { LINX_DEFAULT_SECRETARY, useChatMutations } from '../../collections'

/** "新的 AI 工作": a fresh topic with the default LinX assistant, opened right away. */
export function useStartAiWork() {
  const selectChat = useChatStore((state) => state.selectChat)
  const selectThread = useChatStore((state) => state.selectThread)
  const mutations = useChatMutations()
  const { toast } = useToast()

  const start = useCallback(async () => {
    try {
      const created = await mutations.createThread.mutateAsync({
        chatId: LINX_DEFAULT_SECRETARY.chatId,
        title: '新话题',
      })
      selectChat(LINX_DEFAULT_SECRETARY.chatId)
      if (created?.id) selectThread(created.id)
    } catch (error) {
      toast({ description: formatLoginErrorForUser(error, '没能开始新的工作，请稍后再试。'), variant: 'destructive' })
    }
  }, [mutations, selectChat, selectThread, toast])

  return { start, isStarting: mutations.createThread.isPending }
}
