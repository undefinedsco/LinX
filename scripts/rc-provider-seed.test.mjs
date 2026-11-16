import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  acceptanceAccount,
  bobAccount,
  generateSeed,
  materializeSeed,
  podWebId,
  sharedGroupAccounts,
} from './rc-provider-seed.mjs'

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

test('shared-group acceptance gets Bob as a second, distinct account', () => {
  const accounts = sharedGroupAccounts(materializeSeed(seed, 'linx-12-1'))
  assert.deepEqual(accounts.bob, {
    email: 'bob-linx-12-1@rc.undefineds.co',
    password: 'b-secret',
    podName: 'bob-linx-12-1',
  })
  assert.notEqual(accounts.alice.email, accounts.bob.email)
  assert.notEqual(accounts.alice.podName, accounts.bob.podName)
  assert.throws(() => bobAccount(materializeSeed([seed[0]], 'x')), /Bob/)
  assert.throws(() => sharedGroupAccounts([seed[0], { ...seed[1], email: 'alice@rc.undefineds.co' }]), /distinct/)
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

test('derives the seeded Pod WebID from the provider URL without changing its origin', () => {
  assert.equal(podWebId('https://ids.sealosgzg.site/', 'alice-linx-12-1'),
    'https://ids.sealosgzg.site/alice-linx-12-1/profile/card#me')
  assert.equal(podWebId('https://ids.example', 'bob-linx-12-1'),
    'https://ids.example/bob-linx-12-1/profile/card#me')
  assert.throws(() => podWebId('', 'alice'), /provider URL/)
  assert.throws(() => podWebId('https://ids.example/?x=1', 'alice'), /credentials, query or fragment/)
  assert.throws(() => podWebId('https://user:pw@ids.example/', 'alice'), /credentials, query or fragment/)
})

test('both accounts and masked secrets are written to GITHUB_ENV, passwords never to stdout', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'linx-rc-seed-'))
  try {
    const output = path.join(dir, 'rc.json')
    const envFile = path.join(dir, 'github-env')
    const result = spawnSync(process.execPath, [
      path.join(import.meta.dirname, 'rc-provider-seed.mjs'),
      '--output', output,
      '--suffix', 'linx-7-1',
      '--provider-url', 'https://ids.sealosgzg.site/',
      '--github-env', envFile,
    ], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /seeded 2 accounts/)
    // GitHub consumes ::add-mask:: commands (it masks the value in the log). The human-readable
    // summary must never repeat a password.
    const summary = result.stdout.split('\n').filter((line) => !line.startsWith('::add-mask::')).join('\n')
    assert.doesNotMatch(summary, /Linx-[0-9a-f]{36}/, 'the generated password must not be printed outside the mask command')
    const generated = JSON.parse(readFileSync(output, 'utf8'))
    const env = readFileSync(envFile, 'utf8')
    for (const line of env.trim().split('\n')) {
      const [, ...rest] = line.split('=')
      if (line.includes('_PASSWORD=')) {
        assert.ok(generated.some((account) => account.password === rest.join('=')), line)
        assert.ok(result.stdout.includes(`::add-mask::${rest.join('=')}`), 'each password must be masked')
      }
    }
    for (const prefix of ['LINX_E2E_ACCOUNT', 'LINX_E2E_BOB_ACCOUNT']) {
      for (const key of ['EMAIL', 'PASSWORD', 'POD', 'WEBID']) {
        assert.match(env, new RegExp(`^${prefix}_${key}=.+$`, 'm'), `${prefix}_${key}`)
      }
    }
    assert.match(env, /^LINX_E2E_BOB_ACCOUNT_WEBID=https:\/\/ids\.sealosgzg\.site\/bob-linx-7-1\/profile\/card#me$/m)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
