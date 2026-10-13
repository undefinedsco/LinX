import { create } from 'zustand'
import { DEFAULT_AUTO_JUDGE_WINDOWS, type AutoJudgeConfidence, type AutoJudgeWindows } from '@linx/agent-runtime/auto-judge'

const STORAGE_KEY = 'linx:auto-judge-windows'

function load(): AutoJudgeWindows {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_AUTO_JUDGE_WINDOWS
    const parsed = JSON.parse(raw) as Partial<Record<AutoJudgeConfidence, unknown>>
    const pick = (key: AutoJudgeConfidence) => {
      const value = parsed[key]
      if (value === null) return null
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : DEFAULT_AUTO_JUDGE_WINDOWS[key]
    }
    return { high: pick('high'), medium: pick('medium'), low: pick('low') }
  } catch {
    return DEFAULT_AUTO_JUDGE_WINDOWS
  }
}

interface AutoJudgeSettingsState {
  windows: AutoJudgeWindows
  setWindow: (confidence: AutoJudgeConfidence, ms: number | null) => void
}

/**
 * The three waits (K11). Kept in this browser until the shared models carry a
 * settings field; the runtime reads the same values through `windows`.
 */
export const useAutoJudgeSettings = create<AutoJudgeSettingsState>((set, get) => ({
  windows: load(),
  setWindow: (confidence, ms) => {
    const windows = { ...get().windows, [confidence]: ms }
    set({ windows })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(windows))
    } catch {
      // Private mode: the choice lasts until reload.
    }
  },
}))

export const AUTO_JUDGE_WINDOW_CHOICES: Record<AutoJudgeConfidence, Array<number | null>> = {
  high: [5 * 60_000, 10 * 60_000, 30 * 60_000, 60 * 60_000],
  medium: [30 * 60_000, 60 * 60_000, 2 * 60 * 60_000, 4 * 60 * 60_000, 24 * 60 * 60_000],
  low: [null, 24 * 60 * 60_000],
}
