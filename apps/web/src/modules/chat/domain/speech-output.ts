const MAX_SPEECH_CHUNK_LENGTH = 220

export function markdownToSpeechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/gu, ' 代码块已省略。 ')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gmu, '')
    .replace(/^\s{0,3}>\s?/gmu, '')
    .replace(/^\s*[-*+]\s+/gmu, '')
    .replace(/[*_~]/gu, '')
    .replace(/https?:\/\/\S+/gu, '链接')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function splitSpeechText(text: string, maxLength = MAX_SPEECH_CHUNK_LENGTH): string[] {
  const normalized = markdownToSpeechText(text)
  if (!normalized) return []
  const chunks: string[] = []
  let remaining = normalized
  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength + 1)
    const boundary = Math.max(
      window.lastIndexOf('。'),
      window.lastIndexOf('！'),
      window.lastIndexOf('？'),
      window.lastIndexOf('. '),
      window.lastIndexOf(', '),
      window.lastIndexOf('，'),
      window.lastIndexOf(' '),
    )
    const end = boundary >= Math.floor(maxLength * 0.55) ? boundary + 1 : maxLength
    chunks.push(remaining.slice(0, end).trim())
    remaining = remaining.slice(end).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

export async function speakText(text: string, signal?: AbortSignal): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    throw new Error('当前浏览器不支持朗读。')
  }
  const chunks = splitSpeechText(text)
  if (chunks.length === 0) return
  window.speechSynthesis.cancel()

  for (const chunk of chunks) {
    if (signal?.aborted) throw new DOMException('Speech was cancelled', 'AbortError')
    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.lang = /[\u3400-\u9fff]/u.test(chunk) ? 'zh-CN' : (navigator.language || 'en-US')
      utterance.onend = () => resolve()
      utterance.onerror = (event) => reject(new Error(event.error === 'canceled' || event.error === 'interrupted' ? '朗读已停止。' : '朗读失败，请重试。'))
      const onAbort = () => {
        window.speechSynthesis.cancel()
        reject(new DOMException('Speech was cancelled', 'AbortError'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      const cleanup = () => signal?.removeEventListener('abort', onAbort)
      utterance.addEventListener('end', cleanup, { once: true })
      utterance.addEventListener('error', cleanup, { once: true })
      window.speechSynthesis.speak(utterance)
    })
  }
}
