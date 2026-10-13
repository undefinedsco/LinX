import { useEffect, useState } from 'react'

const avatarPreviewCache = new Map<string, string>()

/**
 * Pod-hosted avatars usually need the authenticated session fetch, so a plain
 * `<img src>` fails. Fetch once per source, keep an object URL per session.
 */
export function useAuthenticatedAvatar(
  avatarSrc: string,
  authFetch: typeof fetch | undefined,
): { previewUrl: string | null; failed: boolean; markFailed: () => void } {
  const [previewUrl, setPreviewUrl] = useState<string | null>(() => (avatarSrc ? avatarPreviewCache.get(avatarSrc) ?? null : null))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!avatarSrc || !authFetch) {
      setPreviewUrl(null)
      setFailed(false)
      return
    }

    const cached = avatarPreviewCache.get(avatarSrc)
    if (cached) {
      setPreviewUrl(cached)
      setFailed(false)
      return
    }

    let cancelled = false
    const loadAvatar = async () => {
      try {
        setFailed(false)
        const response = await authFetch(avatarSrc, {
          method: 'GET',
          headers: { Accept: 'image/*' },
        })
        if (!response.ok) throw new Error(`${response.status}`)
        const objectUrl = URL.createObjectURL(await response.blob())
        avatarPreviewCache.set(avatarSrc, objectUrl)
        if (!cancelled) setPreviewUrl(objectUrl)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    void loadAvatar()
    return () => {
      cancelled = true
    }
  }, [avatarSrc, authFetch])

  return { previewUrl, failed, markFailed: () => setFailed(true) }
}

export function profileInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? Array.from(trimmed)[0]!.toUpperCase() : '我'
}
