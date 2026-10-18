import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/solid/public-resource-access', () => ({
  grantPublicReadAccess: vi.fn().mockResolvedValue(undefined),
}))

import { AVATAR_MAX_BYTES, AvatarTooLargeError, avatarUploadUrl, uploadAvatar } from './avatar-upload'

const WEB_ID = 'https://id.undefineds.co/linzhou/profile/card#me'

describe('avatar upload', () => {
  it('puts the avatar next to profile/card', () => {
    const url = avatarUploadUrl(WEB_ID, { type: 'image/png', name: 'me.png' }, 123)
    expect(url).toBe('https://id.undefineds.co/linzhou/profile/avatar-123.png')
  })

  it('rejects files over 5 MB before any network call', async () => {
    const authFetch = vi.fn()
    const big = new File([new Uint8Array(AVATAR_MAX_BYTES + 1)], 'big.png', { type: 'image/png' })

    await expect(uploadAvatar(authFetch as unknown as typeof fetch, WEB_ID, big)).rejects.toBeInstanceOf(AvatarTooLargeError)
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('uploads a normal image and returns its address', async () => {
    const authFetch = vi.fn().mockResolvedValue({ ok: true, status: 201 })
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' })

    const url = await uploadAvatar(authFetch as unknown as typeof fetch, WEB_ID, file)
    expect(url).toMatch(/\/linzhou\/profile\/avatar-\d+\.jpg$/)
    expect(authFetch).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'PUT' }))
  })

  it('fails when the Pod refuses the upload', async () => {
    const authFetch = vi.fn().mockResolvedValue({ ok: false, status: 507 })
    const file = new File(['x'], 'me.png', { type: 'image/png' })

    await expect(uploadAvatar(authFetch as unknown as typeof fetch, WEB_ID, file)).rejects.toThrow(/507/)
  })
})
