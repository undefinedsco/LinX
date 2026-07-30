import { describe, expect, it, vi } from 'vitest'
import { LocalChatKitService } from '../service'

function createService() {
  const attachments = new Map<string, Record<string, unknown>>()
  const store = {
    saveAttachment: vi.fn(async (attachment: Record<string, unknown>) => {
      attachments.set(String(attachment.id), attachment)
    }),
    loadAttachment: vi.fn(async (id: string) => {
      const attachment = attachments.get(id)
      if (!attachment) throw new Error(`Attachment not found: ${id}`)
      return attachment
    }),
    deleteAttachment: vi.fn(async (id: string) => {
      attachments.delete(id)
    }),
  }
  const service = new LocalChatKitService({
    store: store as any,
    db: {
      getDialect: () => ({
        getPodUrl: () => 'http://localhost:5737/alice/',
      }),
    } as any,
    webId: 'http://localhost:5737/alice/profile/card#me',
    authFetch: vi.fn() as any,
  })
  return { service, store, attachments }
}

describe('LocalChatKitService attachments', () => {
  it('creates an image attachment with a two-phase upload descriptor', async () => {
    const { service, store } = createService()
    const result = await service.process(JSON.stringify({
      type: 'attachments.create',
      params: {
        name: 'diagram.png',
        size: 1024,
        mime_type: 'image/png',
      },
    }), {})

    expect(result.type).toBe('non_streaming')
    if (result.type !== 'non_streaming') return
    const attachment = JSON.parse(result.json)

    expect(attachment).toMatchObject({
      type: 'image',
      name: 'diagram.png',
      mime_type: 'image/png',
      size: 1024,
      upload_descriptor: {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
      },
    })
    expect(attachment.id).toMatch(/^attach-/)
    expect(attachment.preview_url).toMatch(/^data:image\/gif;base64,/)
    expect(attachment.upload_descriptor.url).toContain('/__linx_chatkit_attachment__/')
    expect(store.saveAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ id: attachment.id }),
      {},
    )
  })

  it('removes an attachment when the composer discards it', async () => {
    const { service, store, attachments } = createService()
    attachments.set('attach_test', { id: 'attach_test', attachment_id: 'attach_test' })

    const result = await service.process(JSON.stringify({
      type: 'attachments.delete',
      params: { attachment_id: 'attach_test' },
    }), {})

    expect(result.type).toBe('non_streaming')
    expect(store.deleteAttachment).toHaveBeenCalledWith('attach_test', {})
    expect(attachments.has('attach_test')).toBe(false)
  })
})
