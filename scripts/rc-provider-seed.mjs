#!/usr/bin/env node
/**
 * Seed for the xpod RC provider (ids.sealosgzg.site) that LinX RC acceptance signs in to.
 *
 * Each run generates its own Alice and Bob (random passwords, test-only) in the seed account
 * format of xpod's CSS_SEED_CONFIG, and gives every account and Pod a per-run suffix, as xpod's
 * scripts/materialize-rc-seed-config.ts does, so the CSS seed initializer never meets an account
 * an earlier run already created. Alice signs in for the single-account acceptance; Alice and
 * Bob are the two real browser identities of the shared-group acceptance.
 * --input takes an existing seed JSON instead of generating one.
 *
 *   node scripts/rc-provider-seed.mjs --output rc.json --suffix linx-12-1 \
 *     [--input seed.json] [--github-env $GITHUB_ENV] [--provider-url https://ids.example/]
 *
 * With --github-env it appends both accounts as LINX_E2E_ACCOUNT_* (Alice) and
 * LINX_E2E_BOB_ACCOUNT_* (Bob), and masks both passwords in the log. Passwords are never printed.
 * --provider-url also records each seeded Pod's CSS WebID (`<provider>/<pod>/profile/card#me`),
 * so the UI can add Bob by address without a lookup API substitute.
 */
import { randomBytes } from 'node:crypto'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

function normalizeDnsLabel(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-')
}

function appendDnsSuffix(name, suffix) {
  const normalized = normalizeDnsLabel(name)
  if (!normalized) throw new Error(`seed Pod name cannot be normalized: ${name}`)
  const base = normalized.slice(0, 63 - suffix.length - 1).replace(/-+$/g, '')
  return `${base}-${suffix}`
}

export function generateSeed(random = randomBytes) {
  return ['alice', 'bob'].map((name) => ({
    email: `${name}@rc.undefineds.co`,
    password: `Linx-${random(18).toString('hex')}`,
    pods: [{ name }],
  }))
}

export function materializeSeed(input, suffixInput) {
  if (!Array.isArray(input)) throw new Error('RC seed config must be a seed account array')
  const suffix = normalizeDnsLabel(suffixInput)
  if (!suffix) throw new Error('seed suffix must contain a letter or number')
  return input.map((account, index) => {
    if (!account || typeof account !== 'object' || typeof account.email !== 'string' || !account.email.includes('@')) {
      throw new Error(`seed account ${index} must include an email address`)
    }
    if (!Array.isArray(account.pods) || account.pods.length === 0) throw new Error(`seed account ${index} must include a Pod`)
    const at = account.email.lastIndexOf('@')
    return {
      ...account,
      email: `${account.email.slice(0, at)}-${suffix}@${account.email.slice(at + 1)}`,
      pods: account.pods.map((pod) => ({ ...pod, name: appendDnsSuffix(String(pod?.name ?? ''), suffix) })),
    }
  })
}

/** A seeded account as the browser tests consume it. */
function accountView(account, name) {
  if (!account) throw new Error(`RC seed config must include a ${name} account`)
  if (typeof account.password !== 'string' || !account.password) {
    throw new Error(`the ${name} seed account must have a password`)
  }
  return { email: account.email, password: account.password, podName: account.pods[0].name }
}

/** The Alice account: the first one whose email or Pod names mention alice. */
export function acceptanceAccount(seed) {
  return accountView(
    seed.find((entry) => `${entry.email} ${entry.pods.map((pod) => pod.name).join(' ')}`.toLowerCase().includes('alice')),
    'Alice',
  )
}

/** The Bob account: the second real identity of the shared-group acceptance. */
export function bobAccount(seed) {
  return accountView(
    seed.find((entry) => `${entry.email} ${entry.pods.map((pod) => pod.name).join(' ')}`.toLowerCase().includes('bob')),
    'Bob',
  )
}

/** The two distinct accounts the shared-group acceptance must sign in with. */
export function sharedGroupAccounts(seed) {
  const alice = acceptanceAccount(seed)
  const bob = bobAccount(seed)
  if (alice.email === bob.email || alice.podName === bob.podName) {
    throw new Error('the shared-group acceptance needs two distinct seed accounts and Pods')
  }
  return { alice, bob }
}

/** CSS WebID a seeded Pod serves: `<provider>/<pod>/profile/card#me`. */
export function podWebId(providerUrl, podName) {
  if (typeof providerUrl !== 'string' || !providerUrl.trim()) {
    throw new Error('a provider URL is required to derive seeded WebIDs')
  }
  if (typeof podName !== 'string' || !podName.trim()) {
    throw new Error('a Pod name is required to derive seeded WebIDs')
  }
  let provider
  try {
    provider = new URL(providerUrl)
  } catch {
    throw new Error(`invalid provider URL: ${providerUrl}`)
  }
  if (!['http:', 'https:'].includes(provider.protocol)) {
    throw new Error(`provider URL must be HTTP(S): ${providerUrl}`)
  }
  if (provider.username || provider.password || provider.search || provider.hash) {
    throw new Error('provider URL must not carry credentials, query or fragment')
  }
  return new URL(`${encodeURIComponent(podName)}/profile/card#me`, provider.href.replace(/\/?$/, '/')).href
}

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function envLines(prefix, account, providerUrl) {
  const lines = [
    `${prefix}_EMAIL=${account.email}`,
    `${prefix}_PASSWORD=${account.password}`,
    `${prefix}_POD=${account.podName}`,
  ]
  if (providerUrl) lines.push(`${prefix}_WEBID=${podWebId(providerUrl, account.podName)}`)
  return `${lines.join('\n')}\n`
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try {
    const input = readArg('input')
    const output = readArg('output')
    const suffix = readArg('suffix')
    const providerUrl = readArg('provider-url')
    if (!output || !suffix) throw new Error('usage: rc-provider-seed --output PATH --suffix VALUE [--input PATH] [--github-env PATH] [--provider-url URL]')
    const seed = materializeSeed(input ? JSON.parse(readFileSync(input, 'utf8')) : generateSeed(), suffix)
    const { alice, bob } = sharedGroupAccounts(seed)
    writeFileSync(output, `${JSON.stringify(seed, null, 2)}\n`, { mode: 0o600 })
    const githubEnv = readArg('github-env')
    if (githubEnv) {
      console.log(`::add-mask::${alice.password}`)
      console.log(`::add-mask::${bob.password}`)
      appendFileSync(githubEnv, envLines('LINX_E2E_ACCOUNT', alice, providerUrl))
      appendFileSync(githubEnv, envLines('LINX_E2E_BOB_ACCOUNT', bob, providerUrl))
    }
    console.log(`seeded ${seed.length} accounts; acceptance signs in as ${alice.email} (Pod ${alice.podName}); shared-group Bob (Pod ${bob.podName})`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
