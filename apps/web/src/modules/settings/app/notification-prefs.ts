import { create } from 'zustand'

import {
  DEFAULT_NOTIFICATION_PREFS as DEFAULTS,
  type NotificationPrefKey,
  type NotificationPrefs,
} from '../domain/notification-model'

export type { NotificationPrefKey, NotificationPrefs }

/** Kept on this device (localStorage); delivery itself is the shell's job. */
const STORAGE_KEY = 'linx-notification-prefs'

function read(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>
    const next = { ...DEFAULTS }
    for (const key of Object.keys(DEFAULTS) as NotificationPrefKey[]) {
      if (typeof parsed[key] === 'boolean') next[key] = parsed[key] as boolean
    }
    return next
  } catch {
    return DEFAULTS
  }
}

interface NotificationPrefsStore {
  prefs: NotificationPrefs
  setPref: (key: NotificationPrefKey, value: boolean) => void
}

export const useNotificationPrefs = create<NotificationPrefsStore>((set, get) => ({
  prefs: read(),
  setPref: (key, value) => {
    const prefs = { ...get().prefs, [key]: value }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch {
      // Keep the in-memory choice even when it cannot be remembered.
    }
    set({ prefs })
  },
}))
