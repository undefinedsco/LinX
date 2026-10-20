#!/usr/bin/env node
/**
 * Seed for the xpod RC provider (ids.sealosgzg.site) that LinX RC acceptance signs in to.
 *
 * Each run generates its own Alice and Bob (random passwords, test-only) in the seed account
 * format of xpod's CSS_SEED_CONFIG, and gives every account and Pod a per-run suffix, as xpod's
 * scripts/materialize-rc-seed-config.ts does, so the CSS seed initializer never meets an account
 * an earlier run already created. The Alice account is the one acceptance signs in with.
 * --input takes an existing seed JSON instead of generating one.
 *
 *   node scripts/rc-provider-seed.mjs --output rc.json --suffix linx-12-1 [--input seed.json] [--github-env $GITHUB_ENV]
 *
 * With --github-env it appends LINX_E2E_ACCOUNT_EMAIL / _PASSWORD / _POD for that account and
 * masks the password in the log; the password is never printed.
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

/** The Alice account: the first one whose email or Pod names mention alice. */
export function acceptanceAccount(seed) {
  const account = seed.find((entry) => `${entry.email} ${entry.pods.map((pod) => pod.name).join(' ')}`.toLowerCase().includes('alice'))
  if (!account) throw new Error('RC seed config must include an Alice account')
  if (typeof account.password !== 'string' || !account.password) throw new Error('the Alice seed account must have a password')
  return { email: account.email, password: account.password, podName: account.pods[0].name }
}

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try {
    const input = readArg('input')
    const output = readArg('output')
    const suffix = readArg('suffix')
    if (!output || !suffix) throw new Error('usage: rc-provider-seed --output PATH --suffix VALUE [--input PATH] [--github-env PATH]')
    const seed = materializeSeed(input ? JSON.parse(readFileSync(input, 'utf8')) : generateSeed(), suffix)
    const account = acceptanceAccount(seed)
    writeFileSync(output, `${JSON.stringify(seed, null, 2)}\n`, { mode: 0o600 })
    const githubEnv = readArg('github-env')
    if (githubEnv) {
      console.log(`::add-mask::${account.password}`)
      appendFileSync(githubEnv, `LINX_E2E_ACCOUNT_EMAIL=${account.email}\nLINX_E2E_ACCOUNT_PASSWORD=${account.password}\nLINX_E2E_ACCOUNT_POD=${account.podName}\n`)
    }
    console.log(`seeded ${seed.length} accounts; acceptance signs in as ${account.email} (Pod ${account.podName})`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
