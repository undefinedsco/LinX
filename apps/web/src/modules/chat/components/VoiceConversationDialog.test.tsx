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
})
