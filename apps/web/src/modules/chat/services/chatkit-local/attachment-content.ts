import JSZip from 'jszip'
import type { Attachment } from '@/lib/vendor/xpod-chatkit'

const MAX_EXTRACTED_CHARACTERS = 120_000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const MAX_OFFICE_ENTRIES = 512
const MAX_OFFICE_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
const MAX_PDF_PAGES = 300

export type ModelContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

function truncate(text: string): string {
  if (text.length <= MAX_EXTRACTED_CHARACTERS) return text
  return `${text.slice(0, MAX_EXTRACTED_CHARACTERS)}\n\n[内容过长，已截断]`
}

function decodeXmlText(xml: string): string {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('Office document XML is invalid')
  return (document.documentElement.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function assertSafeOfficeArchive(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let entries = 0
  let totalUncompressedBytes = 0

  for (let offset = 0; offset + 46 <= bytes.byteLength; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue
    const compressedBytes = view.getUint32(offset + 20, true)
    const uncompressedBytes = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    if (compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff) {
      throw new Error('Office document ZIP64 entries are not supported')
    }
    entries += 1
    totalUncompressedBytes += uncompressedBytes
    if (entries > MAX_OFFICE_ENTRIES || totalUncompressedBytes > MAX_OFFICE_UNCOMPRESSED_BYTES) {
      throw new Error('Office document expands beyond the safe extraction limit')
    }
    offset += 45 + nameLength + extraLength + commentLength
  }

  if (entries === 0) throw new Error('Office document central directory is missing')
}

async function extractOfficeText(bytes: Uint8Array, mimeType: string, name: string): Promise<string> {
  assertSafeOfficeArchive(bytes)
  const zip = await JSZip.loadAsync(bytes)
  const extension = name.toLowerCase().split('.').pop()
  let entries: string[]

  if (mimeType.includes('wordprocessingml') || extension === 'docx') {
    entries = ['word/document.xml']
  } else if (mimeType.includes('presentationml') || extension === 'pptx') {
    entries = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/u.test(path))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
  } else if (mimeType.includes('spreadsheetml') || extension === 'xlsx') {
    entries = Object.keys(zip.files)
      .filter((path) => path === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/u.test(path))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
  } else {
    throw new Error(`Unsupported Office document: ${name}`)
  }

  const sections = await Promise.all(entries.map(async (path) => {
    const entry = zip.file(path)
    if (!entry) return ''
    return decodeXmlText(await entry.async('text'))
  }))
  return truncate(sections.filter(Boolean).join('\n\n'))
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const [{ getDocument, GlobalWorkerOptions }, { default: workerSrc }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  // Vite splits this dynamic import, so pdf.js cannot infer the worker URL.
  // An explicit local asset keeps browser PDF extraction independent of a CDN.
  if (typeof Worker !== 'undefined') {
    GlobalWorkerOptions.workerSrc = workerSrc
  }
  const loadingTask = getDocument({ data: bytes })
  const pdf = await loadingTask.promise
  const pages: string[] = []
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF has more than ${MAX_PDF_PAGES} pages`)
    }
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push(content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' '))
    }
  } finally {
    await loadingTask.destroy()
  }
  return truncate(pages.join('\n\n'))
}

function isPlainText(mimeType: string, name: string): boolean {
  return mimeType.startsWith('text/')
    || /(?:json|xml|yaml|toml|javascript|typescript|csv)$/u.test(mimeType)
    || /\.(?:txt|md|csv|json|jsonl|ya?ml|toml|xml|html?|css|js|jsx|ts|tsx|py|java|go|rs|sql|sh)$/iu.test(name)
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

export async function attachmentToModelParts(
  attachment: Attachment,
  bytes: Uint8Array,
): Promise<ModelContentPart[]> {
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    return [{ type: 'text', text: `[附件 ${attachment.name} 超过 25 MB，未解析]` }]
  }
  if (attachment.mime_type.startsWith('image/')) {
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return [{ type: 'text', text: `[图片 ${attachment.name} 超过 10 MB，未发送给视觉模型]` }]
    }
    return [{ type: 'image_url', image_url: { url: bytesToDataUrl(bytes, attachment.mime_type) } }]
  }

  let text: string
  try {
    if (attachment.mime_type === 'application/pdf' || attachment.name.toLowerCase().endsWith('.pdf')) {
      text = await extractPdfText(bytes)
    } else if (/\.(?:docx|pptx|xlsx)$/iu.test(attachment.name)
      || /(?:wordprocessingml|presentationml|spreadsheetml)/u.test(attachment.mime_type)) {
      text = await extractOfficeText(bytes, attachment.mime_type, attachment.name)
    } else if (isPlainText(attachment.mime_type, attachment.name)) {
      text = truncate(new TextDecoder().decode(bytes))
    } else {
      return [{ type: 'text', text: `[附件 ${attachment.name}（${attachment.mime_type}）暂不支持内容解析]` }]
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return [{ type: 'text', text: `[附件 ${attachment.name} 解析失败：${reason}]` }]
  }

  return [{
    type: 'text',
    text: `<attachment name="${attachment.name}" mime_type="${attachment.mime_type}">\n${text || '[没有提取到文本]'}\n</attachment>`,
  }]
}
