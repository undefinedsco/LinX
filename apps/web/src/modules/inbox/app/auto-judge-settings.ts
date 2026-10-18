import { create } from 'zustand'
import {
  DEFAULT_AUTO_JUDGE_WINDOWS,
  readAutoJudgeWindowsFromPod,
  writeAutoJudgeWindowsToPod,
  type AutoJudgeConfidence,
  type AutoJudgeSettingsFetch,
  type AutoJudgeWindows,
} from '@linx/agent-runtime/auto-judge'

/** Browser copy of the waits: the pre-Pod home (migrated once) and an offline cache. */
export const AUTO_JUDGE_WINDOWS_STORAGE_KEY = 'linx:auto-judge-windows'

function loadLocal(): { windows: AutoJudgeWindows; stored: boolean } {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(AUTO_JUDGE_WINDOWS_STORAGE_KEY)
    if (!raw) return { windows: DEFAULT_AUTO_JUDGE_WINDOWS, stored: false }
    const parsed = JSON.parse(raw) as Partial<Record<AutoJudgeConfidence, unknown>>
    const pick = (key: AutoJudgeConfidence) => {
      const value = parsed[key]
      if (value === null) return null
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : DEFAULT_AUTO_JUDGE_WINDOWS[key]
    }
    return { windows: { high: pick('high'), medium: pick('medium'), low: pick('low') }, stored: true }
  } catch {
    return { windows: DEFAULT_AUTO_JUDGE_WINDOWS, stored: false }
  }
}

function saveLocal(windows: AutoJudgeWindows) {
  try {
    localStorage.setItem(AUTO_JUDGE_WINDOWS_STORAGE_KEY, JSON.stringify(windows))
  } catch {
    // Private mode: the choice lasts until reload.
  }
}

interface PodTarget {
  podBaseUrl: string
  fetch: AutoJudgeSettingsFetch
}

interface AutoJudgeSettingsState {
  windows: AutoJudgeWindows
  /** True once the Pod copy has been read (or created from the browser copy). */
  synced: boolean
  setWindow: (confidence: AutoJudgeConfidence, ms: number | null) => void
  /**
   * Reads the waits from the Pod (`settings/linx/auto-judge.ttl`). When the Pod
   * has none yet, the values saved in this browser before are written there
   * once; after that the Pod is the source of truth on every device.
   */
  hydrate: (target: PodTarget) => Promise<void>
}

let podTarget: PodTarget | null = null

/**
 * The three waits (K11). Stored in the person's Pod so the runtime / CLI and
 * other devices use the same values; the browser keeps a cache for offline.
 */
export const useAutoJudgeSettings = create<AutoJudgeSettingsState>((set, get) => ({
  windows: loadLocal().windows,
  synced: false,
  setWindow: (confidence, ms) => {
    const windows = { ...get().windows, [confidence]: ms }
    set({ windows })
    saveLocal(windows)
    if (podTarget) {
      void writeAutoJudgeWindowsToPod(podTarget.podBaseUrl, podTarget.fetch, windows).catch((error) => {
        console.warn('[Inbox] Saving auto-judge waits to the Pod failed:', error)
      })
    }
  },
  hydrate: async (target) => {
    podTarget = target
    try {
      const remote = await readAutoJudgeWindowsFromPod(target.podBaseUrl, target.fetch)
      if (remote) {
        set({ windows: remote, synced: true })
        saveLocal(remote)
        return
      }
      // Nothing in the Pod yet: migrate this browser's values once.
      const local = loadLocal()
      await writeAutoJudgeWindowsToPod(target.podBaseUrl, target.fetch, local.windows)
      set({ windows: local.windows, synced: true })
    } catch (error) {
      // Offline or no access: keep working from the browser copy.
      console.warn('[Inbox] Reading auto-judge waits from the Pod failed:', error)
    }
  },
}))

export const AUTO_JUDGE_WINDOW_CHOICES: Record<AutoJudgeConfidence, Array<number | null>> = {
  high: [5 * 60_000, 10 * 60_000, 30 * 60_000, 60 * 60_000],
  medium: [30 * 60_000, 60 * 60_000, 2 * 60 * 60_000, 4 * 60 * 60_000, 24 * 60 * 60_000],
  low: [null, 24 * 60 * 60_000],
}
