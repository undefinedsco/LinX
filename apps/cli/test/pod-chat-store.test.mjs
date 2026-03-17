import test from 'node:test'
import assert from 'node:assert/strict'

test('formatThreadLabel includes title and workspace when present', async () => {
  const { formatThreadLabel } = await import('../dist/lib/thread-utils.js')

  assert.equal(
    formatThreadLabel({
      id: 'thread-1',
      title: 'CLI Session',
      workspace: '/tmp/worktree',
    }),
    'thread-1 · CLI Session · /tmp/worktree',
  )
})

test('toOpenAiMessages preserves role ordering', async () => {
  const { toOpenAiMessages } = await import('../dist/lib/thread-utils.js')

  assert.deepEqual(
    toOpenAiMessages([
      { role: 'system', content: 'system prompt', createdAt: '2026-03-13T00:00:00.000Z' },
      { role: 'user', content: 'hello', createdAt: '2026-03-13T00:00:01.000Z' },
    ]),
    [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'hello' },
    ],
  )
})
