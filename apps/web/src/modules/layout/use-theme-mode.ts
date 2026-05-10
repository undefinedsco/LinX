import { useEffect, useState } from 'react'
import type { ThemeMode } from './micro-app-registry'

const THEME_STORAGE_KEY = 'linx-theme'

function resolveInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null
  if (saved === 'light' || saved === 'dark') {
    return saved
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export function useThemeMode(): [ThemeMode, () => void, (nextTheme: ThemeMode) => void] {
  const [theme, setTheme] = useState<ThemeMode>(resolveInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))

  return [theme, toggleTheme, setTheme]
}
