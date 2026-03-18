import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

let overlayModule
let cleanup

test.before(async () => {
  const loaded = await loadWatchModule('lib/watch/codex-overlay.ts')
  overlayModule = loaded.module
  cleanup = loaded.cleanup
})

test.after(() => {
  cleanup?.()
})

test('renderCodexOverlay renders title body and selected option', () => {
  const lines = overlayModule.renderCodexOverlay(
    {
      title: 'Approval required',
      body: ['[approval] Approve command: pwd'],
      options: [
        { label: 'Yes', value: 'y', shortcuts: ['y'] },
        { label: 'No', value: 'n', shortcuts: ['n'] },
      ],
      selectedIndex: 1,
    },
    60,
    12,
  )

  assert.match(lines[0], /Approval required/)
  assert.match(lines[1], /Approve command: pwd/)
  assert.ok(lines.some((line) => /> No \[n\]/.test(line)))
  assert.ok(lines.some((line) => /Enter confirm \| Esc cancel/.test(line)))
  assert.equal(lines.at(-1)?.startsWith('└'), true)
})

test('renderCodexOverlay keeps selected option visible when constrained', () => {
  const lines = overlayModule.renderCodexOverlay(
    {
      title: 'Approval required',
      body: ['[approval] Approve command: very long command that will wrap and consume overlay height quickly'],
      options: [
        {
          label: 'Yes, just this once',
          value: 'y',
          description: 'Run only this command one time.',
          shortcuts: ['y'],
        },
        {
          label: 'Yes, for session',
          value: 's',
          description: 'Allow the same command for the rest of this watch session.',
          shortcuts: ['s'],
        },
        {
          label: 'Cancel',
          value: 'c',
          description: 'Abort and let Codex revise the plan instead of continuing immediately.',
          shortcuts: ['c'],
        },
      ],
      selectedIndex: 2,
    },
    64,
    10,
  )

  assert.ok(lines.some((line) => /> Cancel \[c\]/.test(line)))
  assert.ok(lines.some((line) => /option 3\/3/.test(line)))
})
