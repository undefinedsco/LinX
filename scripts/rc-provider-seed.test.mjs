import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptanceAccount, generateSeed, materializeSeed } from './rc-provider-seed.mjs'

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

test('a generated seed has Alice and Bob with fresh passwords each run', () => {
  const first = generateSeed()
  assert.deepEqual(first.map((account) => [account.email, account.pods[0].name]), [['alice@rc.undefineds.co', 'alice'], ['bob@rc.undefineds.co', 'bob']])
  assert.match(first[0].password, /^Linx-[0-9a-f]{36}$/)
  assert.notEqual(first[0].password, generateSeed()[0].password)
  assert.equal(acceptanceAccount(materializeSeed(first, 'linx-3-1')).email, 'alice-linx-3-1@rc.undefineds.co')
})
