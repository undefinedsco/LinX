import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))
const benchmarkScript = join(root, 'scripts/benchmark-plc-agent-skills.mjs')

test('PLC agent skill benchmark is exposed as a repo script', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts?.['benchmark:plc-agent-skills'], 'node scripts/benchmark-plc-agent-skills.mjs')
  assert.equal(pkg.scripts?.['verify:plc-agent-skills'], 'node scripts/benchmark-plc-agent-skills.mjs --static-only')
  assert.equal(pkg.scripts?.['verify:plc-agent-skills:codex'], 'node scripts/benchmark-plc-agent-skills.mjs --static-only --codex-installed')
  assert.equal(pkg.scripts?.['benchmark:plc-agent-skills:codex-e2e'], 'node scripts/benchmark-plc-agent-skills.mjs --static-only --codex-no-login-e2e')
  assert.equal(existsSync(benchmarkScript), true)
})

test('PLC agent skill benchmark verifies portable skill contract in static mode', () => {
  const result = spawnSync(process.execPath, [benchmarkScript, '--static-only'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      LINX_MARKETPLACE_ROOT: join(root, '..', 'marketplace'),
    },
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /PASS skill-contract:capture-auth-local-first/)
  assert.match(result.stdout, /PASS skill-contract:symphony-auth-local-first/)
  assert.match(result.stdout, /PASS skill-contract:modeled-discovery-before-write/)
  assert.match(result.stdout, /plc agent skill benchmark ok/)
})



test('PLC agent skill benchmark fails when installed Codex skill cache diverges', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'plc-codex-cache-test-'))
  try {
    const marketplace = join(root, '..', 'marketplace')
    const codexHome = join(tempRoot, 'codex-home')
    const captureSource = readFileSync(join(marketplace, 'plugins/linx-capture/skills/capture/SKILL.md'), 'utf8')
    mkdirSync(join(codexHome, 'plugins/cache/undefineds/linx-capture/0.0.0/skills/capture'), { recursive: true })
    mkdirSync(join(codexHome, 'plugins/cache/undefineds/linx-symphony/0.0.0/skills/symphony'), { recursive: true })

    writeFileSync(join(codexHome, 'plugins/cache/undefineds/linx-capture/0.0.0/skills/capture/SKILL.md'), captureSource)
    writeFileSync(join(codexHome, 'plugins/cache/undefineds/linx-symphony/0.0.0/skills/symphony/SKILL.md'), 'stale symphony contract\n')

    const result = spawnSync(process.execPath, [benchmarkScript, '--static-only', '--codex-installed'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        LINX_MARKETPLACE_ROOT: marketplace,
        CODEX_HOME: codexHome,
      },
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    })

    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stderr, /codex-installed:symphony: installed skill cache differs from marketplace source/)
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})


test('PLC agent skill benchmark verifies Codex no-login local-first E2E output and outbox', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'plc-codex-e2e-test-'))
  try {
    const fakeBin = join(tempRoot, 'bin')
    mkdirSync(fakeBin, { recursive: true })
    const fakeCodex = join(fakeBin, 'codex')
    writeFileSync(fakeCodex, `#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const args = process.argv.slice(2)
const outputIndex = args.indexOf('--output-last-message')
const cdIndex = args.indexOf('-C')
const outputPath = args[outputIndex + 1]
const workdir = args[cdIndex + 1]
const outboxPath = join(workdir, '.acceptance-solid-home/apps/xpod/outbox/obj-mutations.jsonl')
mkdirSync(join(workdir, '.acceptance-solid-home/apps/xpod/outbox'), { recursive: true })
writeFileSync(outboxPath, JSON.stringify({ kind: 'xpod.obj.mutation', status: 'pending' }) + String.fromCharCode(10))
writeFileSync(outputPath, JSON.stringify({
  schema: 'CapturePolicy',
  discovery_ok: true,
  dry_run_ok: true,
  commit_status: 'pending_local',
  pending_local_ok: true,
  outbox_path: outboxPath,
}))
process.stdout.write('{"type":"turn.completed"}' + String.fromCharCode(10))
`)
    chmodSync(fakeCodex, 0o755)

    const result = spawnSync(process.execPath, [benchmarkScript, '--static-only', '--codex-no-login-e2e'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        LINX_MARKETPLACE_ROOT: join(root, '..', 'marketplace'),
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      },
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    })

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /PASS codex-e2e:no-login-local-first/)
    assert.match(result.stdout, /plc agent skill benchmark ok .*codex no-login local-first e2e/)
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})
