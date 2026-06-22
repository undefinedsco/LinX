import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('resolveSecretaryReactionWindowMs clamps model decisions to the visible minimum window', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/auto-mode/secretary-reaction-window.ts')
  t.after(() => cleanup())

  assert.equal(module.resolveSecretaryReactionWindowMs({
    canAutoDecide: true,
    reactionWindowMs: 1,
    source: 'model',
  }), 5000)
})

test('resolveSecretaryReactionWindowMs allows fallback decisions to stay immediate', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/auto-mode/secretary-reaction-window.ts')
  t.after(() => cleanup())

  assert.equal(module.resolveSecretaryReactionWindowMs({
    canAutoDecide: true,
    reactionWindowMs: 0,
    source: 'fallback',
  }), 0)
})
