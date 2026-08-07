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
})
