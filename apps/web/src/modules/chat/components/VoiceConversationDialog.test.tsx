import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceConversationDialog } from './VoiceConversationDialog'

class FakeRecognition {
  static instance: FakeRecognition | null = null
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()

  constructor() {
    FakeRecognition.instance = this
  }
}

afterEach(() => {
  delete (window as any).SpeechRecognition
  delete (window as any).webkitSpeechRecognition
  FakeRecognition.instance = null
  vi.restoreAllMocks()
})

describe('VoiceConversationDialog', () => {
  it('explains the ChatKit dictation fallback when live recognition is unavailable', () => {
    render(<VoiceConversationDialog open onOpenChange={vi.fn()} onSend={vi.fn()} assistantText="" isGenerating={false} />)
    expect(screen.getByRole('alert')).toHaveTextContent('ChatKit 输入框内置的语音输入')
  })

  it('automatically sends the final recognized utterance', async () => {
    ;(window as any).webkitSpeechRecognition = FakeRecognition
    const onSend = vi.fn(async () => undefined)
    render(<VoiceConversationDialog open onOpenChange={vi.fn()} onSend={onSend} assistantText="" isGenerating={false} />)

    await waitFor(() => expect(FakeRecognition.instance?.start).toHaveBeenCalledOnce())
    const recognition = FakeRecognition.instance!
    act(() => {
      recognition.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: '帮我总结今天的工作' } }],
      })
      recognition.onend?.()
    })

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('帮我总结今天的工作'))
  })

  it('recovers listening when generation ends without a new assistant response', async () => {
    ;(window as any).webkitSpeechRecognition = FakeRecognition
    const onSend = vi.fn(async () => undefined)
    const { rerender } = render(<VoiceConversationDialog open onOpenChange={vi.fn()} onSend={onSend} assistantText="旧回答" isGenerating={false} />)

    await waitFor(() => expect(FakeRecognition.instance?.start).toHaveBeenCalledOnce())
    const firstRecognition = FakeRecognition.instance!
    act(() => {
      firstRecognition.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: '继续测试' } }],
      })
      firstRecognition.onend?.()
    })
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('继续测试'))

    rerender(<VoiceConversationDialog open onOpenChange={vi.fn()} onSend={onSend} assistantText="旧回答" isGenerating />)
    rerender(<VoiceConversationDialog open onOpenChange={vi.fn()} onSend={onSend} assistantText="旧回答" isGenerating={false} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('回答生成失败，请重试')
    act(() => screen.getByRole('button', { name: '继续聆听' }).click())
    await waitFor(() => expect(FakeRecognition.instance).not.toBe(firstRecognition))
    expect(FakeRecognition.instance?.start).toHaveBeenCalledOnce()
  })
})
