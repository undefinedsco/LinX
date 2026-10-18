import { useCallback, useState } from 'react'
import { useSession } from '@/providers/solid-session-context'
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { contactOps, type SolidProfileInfo, type SolidProfileLookup } from '../../data/collections'
import { formatAccountAddress, isSameAccount, parseAccountInput } from '../../domain/account-address'

/** Every state of "添加朋友" (W5b) has its own plain sentence. */
export type AddFriendState =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'found'; profile: SolidProfileInfo; existingContactId: string | null }
  | { kind: 'problem'; text: string }

const LOOKUP_PROBLEMS: Record<Exclude<SolidProfileLookup['status'], 'found'>, string> = {
  'not-found': '没有找到这个账号',
  unreadable: '找到了这个账号，但对方的资料没有公开，暂时不能添加',
  unreachable: '现在连不上对方所在的服务，请稍后再试',
  offline: '没有网络，连上后再试',
  'not-ready': '你的空间还没准备好，请稍后再试',
}

export interface AddedFriend {
  contactId: string
  chatId: string
}

export function useAddFriend(options: { onAdded?: (friend: AddedFriend) => void } = {}) {
  const { session } = useSession()
  const [input, setInputValue] = useState('')
  const [state, setState] = useState<AddFriendState>({ kind: 'idle' })
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const setInput = useCallback((value: string) => {
    setInputValue(value)
    setState({ kind: 'idle' })
    setAddError(null)
  }, [])

  const reset = useCallback(() => {
    setInputValue('')
    setState({ kind: 'idle' })
    setAddError(null)
    setIsAdding(false)
  }, [])

  const search = useCallback(async () => {
    setAddError(null)
    const parsed = parseAccountInput(input)
    if (parsed.kind === 'empty') {
      setState({ kind: 'problem', text: '先粘贴对方的账号' })
      return
    }
    if (parsed.kind === 'invalid') {
      setState({ kind: 'problem', text: '这个账号看起来不对，请检查后再试' })
      return
    }
    if (isSameAccount(parsed.webId, session.info.webId)) {
      setState({ kind: 'problem', text: '这是你自己的账号' })
      return
    }
    setState({ kind: 'searching' })
    try {
      const result = await contactOps.lookupSolidProfile(parsed.webId)
      if (result.status === 'found') {
        setState({
          kind: 'found',
          profile: result.profile,
          existingContactId: contactOps.findPersonByAccount(result.profile.webId)?.id ?? null,
        })
        return
      }
      setState({ kind: 'problem', text: LOOKUP_PROBLEMS[result.status] })
    } catch {
      setState({ kind: 'problem', text: LOOKUP_PROBLEMS.unreachable })
    }
  }, [input, session.info.webId])

  const add = useCallback(async () => {
    if (state.kind !== 'found' || state.existingContactId || isAdding) return
    setAddError(null)
    setIsAdding(true)
    try {
      const { name, webId, avatarUrl } = state.profile
      const result = await contactOps.addFriend({ name, webId, avatarUrl })
      options.onAdded?.({ contactId: result.id, chatId: result.chatId })
    } catch (error) {
      console.error('Add friend failed:', error)
      setAddError(formatErrorForUser(error, '添加失败，请稍后再试。'))
    } finally {
      setIsAdding(false)
    }
  }, [isAdding, options, state])

  return {
    input,
    setInput,
    state,
    isAdding,
    addError,
    search,
    add,
    reset,
    /** "名字@提供方" for the found person. */
    foundAddress: state.kind === 'found' ? formatAccountAddress(state.profile.webId) : null,
  }
}
