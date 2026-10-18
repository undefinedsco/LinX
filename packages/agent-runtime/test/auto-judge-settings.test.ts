import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUTO_JUDGE_SETTINGS_PATH,
  DEFAULT_AUTO_JUDGE_WINDOWS,
  parseAutoJudgeWindows,
  readAutoJudgeWindowsFromPod,
  serializeAutoJudgeWindows,
  writeAutoJudgeWindowsToPod,
} from '../src/auto-judge'

test('auto-judge waits round-trip through the Pod settings document', () => {
  const windows = { high: 5 * 60_000, medium: null, low: 24 * 60 * 60_000 }
  assert.deepEqual(parseAutoJudgeWindows(serializeAutoJudgeWindows(windows)), windows)
  assert.deepEqual(parseAutoJudgeWindows(serializeAutoJudgeWindows(DEFAULT_AUTO_JUDGE_WINDOWS)), DEFAULT_AUTO_JUDGE_WINDOWS)
})

test('a document without waits parses to null; a missing band keeps its default', () => {
  assert.equal(parseAutoJudgeWindows('<#x> a <urn:other> .'), null)
  assert.deepEqual(
    parseAutoJudgeWindows('<#w> linx:highWaitMs 60000 .'),
    { ...DEFAULT_AUTO_JUDGE_WINDOWS, high: 60000 },
  )
})

test('read/write use the settings path; 404 means nothing stored', async () => {
  const calls: Array<{ url: string; method?: string; body?: string }> = []
  let stored: string | null = null
  const fetchFn = async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method, body: init?.body })
    if (init?.method === 'PUT') {
      stored = init.body ?? ''
      return { ok: true, status: 201, text: async () => '' }
    }
    return stored === null
      ? { ok: false, status: 404, text: async () => '' }
      : { ok: true, status: 200, text: async () => stored as string }
  }
  assert.equal(await readAutoJudgeWindowsFromPod('https://pod.example/alice/', fetchFn), null)
  await writeAutoJudgeWindowsToPod('https://pod.example/alice/', fetchFn, { high: 1000, medium: 2000, low: null })
  assert.equal(calls[1].url, `https://pod.example/alice/${AUTO_JUDGE_SETTINGS_PATH}`)
  assert.deepEqual(await readAutoJudgeWindowsFromPod('https://pod.example/alice', fetchFn), { high: 1000, medium: 2000, low: null })
})
