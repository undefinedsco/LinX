import type { AttachmentAdapter } from '@assistant-ui/react'

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const MAX_ATTACHMENT_COUNT = 10

/** Same file types the ChatKit composer accepted. */
export const ATTACHMENT_ACCEPT = [
  'image/*', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.md', '.csv', '.json',
].join(',')

function readAsDataUrl(file: File, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取附件失败'))
    signal?.addEventListener('abort', () => { reader.abort(); reject(new DOMException('aborted', 'AbortError')) }, { once: true })
    reader.readAsDataURL(file)
  })
}

/**
 * Attachments stay with the composer until send. On send the bytes ride the
 * AG-UI user message as media parts; the agent stores them in the Pod.
 */
export const localAttachmentAdapter: AttachmentAdapter = {
  accept: ATTACHMENT_ACCEPT,
  async add({ file }) {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('附件太大，请选择 25 MB 以内的文件。')
    return {
      id: crypto.randomUUID(),
      type: file.type.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      contentType: file.type || 'application/octet-stream',
      file,
      status: { type: 'requires-action', reason: 'composer-send' },
    }
  },
  async send(attachment, options) {
    const dataUrl = await readAsDataUrl(attachment.file, options?.signal)
    const mimeType = attachment.contentType || 'application/octet-stream'
    const content = attachment.type === 'image'
      ? [{ type: 'image' as const, image: dataUrl, filename: attachment.name }]
      : [{ type: 'file' as const, data: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType, filename: attachment.name }]
    return { ...attachment, status: { type: 'complete' }, content }
  },
  async remove() {},
}
