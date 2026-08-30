import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, Mic, MicOff, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { speakText } from '../domain/speech-output'

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

export interface VoiceConversationDialogProps {
  open: boolean
  canSend: boolean
  onOpenChange: (open: boolean) => void
  onSend: (text: string) => Promise<void>
  assistantText: string
  isGenerating: boolean
}

export function VoiceConversationDialog(props: VoiceConversationDialogProps) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const transcriptRef = useRef('')
  const awaitingResponseRef = useRef(false)
  const observedGenerationRef = useRef(false)
  const responseBaselineRef = useRef('')
  const sendingRef = useRef(false)
  const assistantTextRef = useRef(props.assistantText)
  const onSendRef = useRef(props.onSend)
  const speechAbortRef = useRef<AbortController | null>(null)
  const openRef = useRef(props.open)
  const canSendRef = useRef(props.canSend)
  openRef.current = props.open
  canSendRef.current = props.canSend
  assistantTextRef.current = props.assistantText
  onSendRef.current = props.onSend
  const [listening, setListening] = useState(false)
  const [sending, setSending] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const supported = typeof window !== 'undefined' && recognitionConstructor() !== null

  const stopListening = useCallback((abort = false) => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onend = null
      if (abort) recognition.abort(); else recognition.stop()
    }
    setListening(false)
  }, [])

  const sendTranscript = useCallback(async (text: string) => {
    const normalized = text.trim()
    if (!normalized || sendingRef.current || awaitingResponseRef.current) return
    sendingRef.current = true
    setSending(true)
    setError(null)
    try {
      responseBaselineRef.current = assistantTextRef.current
      awaitingResponseRef.current = true
      observedGenerationRef.current = false
      await onSendRef.current(normalized)
      setTranscript('')
      transcriptRef.current = ''
      setInterimTranscript('')
    } catch (reason) {
      awaitingResponseRef.current = false
      observedGenerationRef.current = false
      const message = reason instanceof Error ? reason.message : ''
      setError(/sendUserMessage\(\).*thread is loading/i.test(message)
        ? '会话仍在加载，请稍候后继续说。'
        : message || '语音消息发送失败，请重试。')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [])

  const startListening = useCallback(() => {
    const Recognition = recognitionConstructor()
    if (!Recognition || !canSendRef.current || recognitionRef.current || awaitingResponseRef.current) return
    speechAbortRef.current?.abort()
    window.speechSynthesis?.cancel()
    setSpeaking(false)
    setError(null)
    transcriptRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    const recognition = new Recognition()
    recognition.lang = navigator.language || 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let finalText = transcriptRef.current
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const value = result?.[0]?.transcript ?? ''
        if (result?.isFinal) finalText += value
        else interim += value
      }
      transcriptRef.current = finalText
      setTranscript(finalText)
      setInterimTranscript(interim)
    }
    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setError(event.error === 'not-allowed'
          ? '未获得麦克风权限，请在浏览器设置中允许后重试。'
          : `语音识别失败：${event.error}`)
      }
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
      const finalText = transcriptRef.current.trim()
      if (openRef.current && canSendRef.current && finalText) void sendTranscript(finalText)
    }
    recognitionRef.current = recognition
    setListening(true)
    try {
      recognition.start()
    } catch (reason) {
      recognitionRef.current = null
      setListening(false)
      setError(reason instanceof Error ? reason.message : '无法启动语音识别。')
    }
  }, [sendTranscript])

  useEffect(() => {
    if (!props.open || !props.canSend) {
      stopListening(true)
      if (!props.open) {
        speechAbortRef.current?.abort()
        window.speechSynthesis?.cancel()
        setSpeaking(false)
        awaitingResponseRef.current = false
        observedGenerationRef.current = false
      }
      return
    }
    if (supported) startListening()
  }, [props.canSend, props.open, startListening, stopListening, supported])

  useEffect(() => {
    if (!props.open || !awaitingResponseRef.current) return
    if (props.isGenerating) {
      observedGenerationRef.current = true
      return
    }

    const hasNewResponse = Boolean(props.assistantText)
      && props.assistantText !== responseBaselineRef.current
    if (!hasNewResponse) {
      if (!observedGenerationRef.current) return
      awaitingResponseRef.current = false
      observedGenerationRef.current = false
      setError('回答生成失败，请重试。')
      return
    }

    awaitingResponseRef.current = false
    observedGenerationRef.current = false
    const controller = new AbortController()
    speechAbortRef.current = controller
    setSpeaking(true)
    void speakText(props.assistantText, controller.signal).catch((reason) => {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
        setError(reason instanceof Error ? reason.message : '回答朗读失败。')
      }
    }).finally(() => {
      if (speechAbortRef.current === controller) speechAbortRef.current = null
      setSpeaking(false)
      if (openRef.current) startListening()
    })
  }, [props.assistantText, props.isGenerating, props.open, startListening])

  useEffect(() => () => {
    stopListening(true)
    speechAbortRef.current?.abort()
    window.speechSynthesis?.cancel()
  }, [stopListening])

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>实时语音对话</DialogTitle>
          <DialogDescription>识别完成后自动发送，回答完成后自动朗读，并继续聆听下一轮。</DialogDescription>
        </DialogHeader>
        {!supported ? (
          <div role="alert" className="rounded-lg border border-warning/25 bg-warning/5 p-3 text-sm">
            当前浏览器没有可用的实时语音识别 API。仍可使用 ChatKit 输入框内置的语音输入。
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border bg-muted/20 p-5 text-center">
              {!props.canSend || sending || props.isGenerating ? <LoaderCircle className="mb-3 size-8 animate-spin text-primary" /> : speaking ? <Volume2 className="mb-3 size-8 animate-pulse text-primary" /> : listening ? <Mic className="mb-3 size-8 animate-pulse text-primary" /> : <MicOff className="mb-3 size-8 text-muted-foreground" />}
              <p className="text-sm font-medium">
                {!props.canSend ? '正在准备会话…' : sending ? '正在发送…' : props.isGenerating ? '正在等待回答…' : speaking ? '正在朗读回答…' : listening ? '正在聆听…' : '麦克风已暂停'}
              </p>
              <p className="mt-2 max-h-24 overflow-y-auto text-sm text-muted-foreground">
                {transcript || interimTranscript || (!props.canSend ? '加载完成后会自动开始聆听。' : '开始说话，停顿后会自动发送。')}
              </p>
            </div>
            <div className="flex justify-center">
              {listening ? (
                <Button type="button" variant="outline" onClick={() => stopListening(false)}><MicOff className="mr-2 size-4" />暂停聆听</Button>
              ) : (
                <Button type="button" disabled={!props.canSend || sending || props.isGenerating || speaking} onClick={startListening}><Mic className="mr-2 size-4" />继续聆听</Button>
              )}
            </div>
          </div>
        )}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>结束语音对话</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
