export function readPrototypeStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback

  try {
    const stored = window.localStorage.getItem(key)
    if (!stored) return fallback
    return JSON.parse(stored) as T
  } catch {
    return fallback
  }
}

export function writePrototypeStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Prototype-only persistence should not block the UI when storage is unavailable.
  }
}
