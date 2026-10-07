import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { attachmentToModelParts } from '../attachment-content'

function attachment(name: string, mime_type: string) {
  return { id: `attachment-${name}`, type: mime_type.startsWith('image/') ? 'image' as const : 'file' as const, name, mime_type }
}

function createMinimalPdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return new TextEncoder().encode(pdf)
}

describe('ChatKit attachment model content', () => {
  it('creates an image_url part for visual models', async () => {
    const parts = await attachmentToModelParts(attachment('pixel.png', 'image/png'), new Uint8Array([1, 2, 3]))
    expect(parts).toEqual([{ type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } }])
  })

  it('extracts PDF text', async () => {
    vi.stubGlobal('DOMMatrix', class DOMMatrix {})
    vi.stubGlobal('Path2D', class Path2D {})
    const parts = await attachmentToModelParts(attachment('brief.pdf', 'application/pdf'), createMinimalPdf('Hello PDF'))
    expect(parts[0]).toMatchObject({ type: 'text', text: expect.stringContaining('Hello PDF') })
  })

  it('extracts Word OOXML text', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', '<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Hello DOCX</w:t></w:r></w:p></w:body></w:document>')
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    const parts = await attachmentToModelParts(
      attachment('brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      bytes,
    )
    expect(parts[0]).toMatchObject({ type: 'text', text: expect.stringContaining('Hello DOCX') })
  })

  it('keeps oversized images and unsupported files out of model binary content', async () => {
    await expect(attachmentToModelParts(
      attachment('large.png', 'image/png'),
      new Uint8Array(10 * 1024 * 1024 + 1),
    )).resolves.toEqual([{ type: 'text', text: '[图片 large.png 超过 10 MB，未发送给视觉模型]' }])

    await expect(attachmentToModelParts(
      attachment('archive.bin', 'application/octet-stream'),
      new Uint8Array([1, 2, 3]),
    )).resolves.toEqual([{
      type: 'text',
      text: '[附件 archive.bin（application/octet-stream）暂不支持内容解析]',
    }])
  })

  it('rejects oversized attachments and unsafe Office expansion metadata before parsing', async () => {
    await expect(attachmentToModelParts(
      attachment('large.txt', 'text/plain'),
      new Uint8Array(25 * 1024 * 1024 + 1),
    )).resolves.toEqual([{ type: 'text', text: '[附件 large.txt 超过 25 MB，未解析]' }])

    const centralDirectory = new Uint8Array(46)
    const view = new DataView(centralDirectory.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint32(20, 1, true)
    view.setUint32(24, 51 * 1024 * 1024, true)
    const [officePart] = await attachmentToModelParts(
      attachment('bomb.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      centralDirectory,
    )
    expect(officePart).toMatchObject({
      type: 'text',
      text: expect.stringContaining('safe extraction limit'),
    })
  })

  it('returns a model-safe explanation when document parsing fails', async () => {
    const [pdfPart] = await attachmentToModelParts(
      attachment('broken.pdf', 'application/pdf'),
      new TextEncoder().encode('not a pdf'),
    )
    expect(pdfPart).toMatchObject({ type: 'text', text: expect.stringMatching(/^\[附件 broken\.pdf 解析失败：/) })

    const [officePart] = await attachmentToModelParts(
      attachment('broken.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      new Uint8Array([1, 2, 3]),
    )
    expect(officePart).toMatchObject({ type: 'text', text: expect.stringMatching(/^\[附件 broken\.docx 解析失败：/) })
  })

  it('decodes plain text, reports empty content, and truncates long documents', async () => {
    await expect(attachmentToModelParts(
      attachment('notes.txt', 'text/plain'),
      new TextEncoder().encode('hello text'),
    )).resolves.toEqual([{
      type: 'text',
      text: '<attachment name="notes.txt" mime_type="text/plain">\nhello text\n</attachment>',
    }])

    const [emptyPart] = await attachmentToModelParts(
      attachment('empty.txt', 'text/plain'),
      new Uint8Array(),
    )
    expect(emptyPart).toMatchObject({ type: 'text', text: expect.stringContaining('[没有提取到文本]') })

    const [longPart] = await attachmentToModelParts(
      attachment('long.txt', 'text/plain'),
      new TextEncoder().encode('x'.repeat(120_001)),
    )
    expect(longPart).toMatchObject({ type: 'text', text: expect.stringContaining('[内容过长，已截断]') })
    expect(longPart.type === 'text' ? longPart.text.includes('x'.repeat(120_001)) : true).toBe(false)
  })
})
