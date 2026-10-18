import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptanceAccount, materializeSeed } from './rc-provider-seed.mjs'

const seed = [
  { email: 'alice@rc.undefineds.co', password: 'a-secret', pods: [{ name: 'Alice' }] },
  { email: 'bob@rc.undefineds.co', password: 'b-secret', pods: [{ name: 'bob' }] },
]

test('every account and Pod gets the per-run suffix, as xpod materializes it', () => {
  assert.deepEqual(materializeSeed(seed, 'linx-12-1'), [
    { email: 'alice-linx-12-1@rc.undefineds.co', password: 'a-secret', pods: [{ name: 'alice-linx-12-1' }] },
    { email: 'bob-linx-12-1@rc.undefineds.co', password: 'b-secret', pods: [{ name: 'bob-linx-12-1' }] },
  ])
})

test('acceptance signs in as Alice', () => {
  assert.deepEqual(acceptanceAccount(materializeSeed(seed, 'linx-12-1')), {
    email: 'alice-linx-12-1@rc.undefineds.co',
    password: 'a-secret',
    podName: 'alice-linx-12-1',
  })
})

test('rejects a seed that is not an account array or has no Alice', () => {
  assert.throws(() => materializeSeed({}, 'x'), /array/)
  assert.throws(() => materializeSeed([{ email: 'carol@x', pods: [] }], 'x'), /Pod/)
  assert.throws(() => acceptanceAccount(materializeSeed([seed[1]], 'x')), /Alice/)
})
