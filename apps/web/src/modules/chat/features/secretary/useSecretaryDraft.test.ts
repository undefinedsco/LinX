import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSecretaryDraft } from './useSecretaryDraft'

const draftScope = { accountScope: 'acct', chatId: 'secretary' }

function setup() {
  const onSubmit = vi.fn()
  const hook = renderHook(() => useSecretaryDraft({
    scopeKey: 'acct',
    draftScope,
    selectedChatId: 'secretary',
    webId: 'https://alice.example/profile/card#me',
    onSubmit,
  }))
  return { hook, onSubmit }
}

describe('useSecretaryDraft submit', () => {
  it('marks the pending draft to send itself when asked (welcome sends once)', () => {
    const { hook } = setup()
    act(() => hook.result.current.updateDraft('帮我比较几个方案'))
    act(() => hook.result.current.submitDraft({ autoSend: true }))
    expect(hook.result.current.activePendingDraft).toMatchObject({ text: '帮我比较几个方案', autoSend: true })
  })

  it('can submit a suggestion prompt directly', () => {
    const { hook, onSubmit } = setup()
    act(() => hook.result.current.submitDraft({ text: '每周提醒我一件事', autoSend: true }))
    expect(hook.result.current.activePendingDraft).toMatchObject({ text: '每周提醒我一件事', autoSend: true })
    expect(onSubmit).toHaveBeenCalled()
  })

  it('keeps the plain handoff when not asked to send', () => {
    const { hook } = setup()
    act(() => hook.result.current.updateDraft('hi'))
    act(() => hook.result.current.submitDraft())
    expect(hook.result.current.activePendingDraft?.autoSend).toBeUndefined()
  })
})
