import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_AUTO_JUDGE_WINDOWS, serializeAutoJudgeWindows } from '@linx/agent-runtime/auto-judge'
import { AUTO_JUDGE_WINDOWS_STORAGE_KEY, useAutoJudgeSettings } from './auto-judge-settings'

function podFetch(initial: string | null) {
  let stored = initial
  const puts: string[] = []
  const fetch = async (_url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'PUT') {
      stored = init.body ?? ''
      puts.push(stored)
      return { ok: true, status: 201, text: async () => '' }
    }
    return stored === null
      ? { ok: false, status: 404, text: async () => '' }
      : { ok: true, status: 200, text: async () => stored as string }
  }
  return { fetch, puts }
}

describe('auto-judge waits in the Pod', () => {
  beforeEach(() => {
    localStorage.removeItem(AUTO_JUDGE_WINDOWS_STORAGE_KEY)
    useAutoJudgeSettings.setState({ windows: DEFAULT_AUTO_JUDGE_WINDOWS, synced: false })
  })

  it('reads the waits from the Pod', async () => {
    const pod = podFetch(serializeAutoJudgeWindows({ high: 60_000, medium: null, low: null }))
    await useAutoJudgeSettings.getState().hydrate({ podBaseUrl: 'https://pod.example/alice', fetch: pod.fetch })
    expect(useAutoJudgeSettings.getState().windows).toEqual({ high: 60_000, medium: null, low: null })
    expect(pod.puts).toHaveLength(0)
  })

  it('migrates the browser copy to the Pod once when the Pod has none', async () => {
    localStorage.setItem(AUTO_JUDGE_WINDOWS_STORAGE_KEY, JSON.stringify({ high: 300_000, medium: 3_600_000, low: null }))
    useAutoJudgeSettings.setState({ windows: { high: 300_000, medium: 3_600_000, low: null } })
    const pod = podFetch(null)
    await useAutoJudgeSettings.getState().hydrate({ podBaseUrl: 'https://pod.example/alice', fetch: pod.fetch })
    expect(pod.puts).toHaveLength(1)
    expect(pod.puts[0]).toContain('highWaitMs 300000')
    expect(useAutoJudgeSettings.getState().synced).toBe(true)
  })

  it('writes later changes to the Pod', async () => {
    const pod = podFetch(serializeAutoJudgeWindows(DEFAULT_AUTO_JUDGE_WINDOWS))
    await useAutoJudgeSettings.getState().hydrate({ podBaseUrl: 'https://pod.example/alice', fetch: pod.fetch })
    useAutoJudgeSettings.getState().setWindow('high', 30 * 60_000)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(pod.puts.at(-1)).toContain('highWaitMs 1800000')
  })
})
