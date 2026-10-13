import { useCallback, useEffect } from 'react'
import { create } from 'zustand'
import type { ThemeMode } from './micro-app-registry'

/** 外观：跟随系统 / 浅色 / 深色。桌面版和网页版共用这一份。 */
export type ThemePreference = 'system' | ThemeMode

const THEME_STORAGE_KEY = 'linx-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readStoredPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {
    // Storage can be unavailable (private mode); fall back to the system.
  }
  return 'system'
}

function readSystemDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return Boolean(window.matchMedia(DARK_QUERY)?.matches)
}

interface ThemeState {
  preference: ThemePreference
  systemDark: boolean
  setPreference: (preference: ThemePreference) => void
  setSystemDark: (systemDark: boolean) => void
}

/**
 * One shared theme for the whole shell, so the rail menu and Settings never
 * hold two different answers.
 */
const useThemeStore = create<ThemeState>((set) => ({
  preference: typeof window === 'undefined' ? 'system' : readStoredPreference(),
  systemDark: readSystemDark(),
  setPreference: (preference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference)
    } catch {
      // Keep the in-memory choice even when it cannot be remembered.
    }
    set({ preference })
  },
  setSystemDark: (systemDark) => set({ systemDark }),
}))

export function resolveThemeMode(preference: ThemePreference, systemDark: boolean): ThemeMode {
  if (preference === 'system') return systemDark ? 'dark' : 'light'
  return preference
}

function useAppliedTheme(): ThemeMode {
  const preference = useThemeStore((state) => state.preference)
  const systemDark = useThemeStore((state) => state.systemDark)
  const setSystemDark = useThemeStore((state) => state.setSystemDark)
  const theme = resolveThemeMode(preference, systemDark)

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    if (preference !== 'system' || typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia(DARK_QUERY)
    if (!query) return undefined
    const update = () => setSystemDark(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [preference, setSystemDark])

  return theme
}

export function useThemeMode(): [ThemeMode, () => void, (nextTheme: ThemeMode) => void] {
  const theme = useAppliedTheme()
  const setPreference = useThemeStore((state) => state.setPreference)
  const toggleTheme = useCallback(() => setPreference(theme === 'dark' ? 'light' : 'dark'), [setPreference, theme])
  const setTheme = useCallback((nextTheme: ThemeMode) => setPreference(nextTheme), [setPreference])
  return [theme, toggleTheme, setTheme]
}

export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void] {
  useAppliedTheme()
  const preference = useThemeStore((state) => state.preference)
  const setPreference = useThemeStore((state) => state.setPreference)
  return [preference, setPreference]
}
