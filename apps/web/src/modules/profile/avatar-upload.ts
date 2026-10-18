import { grantPublicReadAccess } from '@/lib/solid/public-resource-access'
import { profileDocumentUri } from './domain/account-handle'

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024

export class AvatarTooLargeError extends Error {
  constructor() {
    super('Avatar exceeds 5 MB')
    this.name = 'AvatarTooLargeError'
  }
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
}

/** Avatars live next to profile/card, so they are as public as the card itself. */
export function avatarUploadUrl(webId: string, file: Pick<File, 'type' | 'name'>, now = Date.now()): string {
  const documentUri = profileDocumentUri(webId)
  const container = documentUri.slice(0, documentUri.lastIndexOf('/') + 1)
  const fromName = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined
  const extension = EXTENSIONS[file.type] ?? (fromName && /^[a-z0-9]{2,5}$/u.test(fromName) ? fromName : 'img')
  return `${container}avatar-${now}.${extension}`
}

/**
 * Binary upload of a new avatar. Returns the resource URL to store as
 * vcard:hasPhoto. Too-large files are rejected before any network call.
 */
export async function uploadAvatar(authFetch: typeof fetch, webId: string, file: File): Promise<string> {
  if (file.size > AVATAR_MAX_BYTES) throw new AvatarTooLargeError()

  const url = avatarUploadUrl(webId, file)
  const response = await authFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) throw new Error(`Avatar upload failed with HTTP ${response.status}`)

  try {
    // profile/card is public; the avatar must be readable by the same people.
    await grantPublicReadAccess(authFetch, url, webId)
  } catch {
    // Most Pods already inherit public read from the profile container.
  }
  return url
}
