import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const sourceScript = join(repoRoot, 'apps/cli/src/lib/codex-plugin/symphony-hook-events.mjs')

function runHook(script, payload, env = {}) {
  return spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    input: `${JSON.stringify(payload)}\n`,
    encoding: 'utf-8',
  })
}

test('symphony Codex native hook records redacted lifecycle events when configured', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-codex-hook-'))
  const eventsPath = join(root, 'events', 'codex.jsonl')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const result = runHook(sourceScript, {
    hook_event_name: 'PostToolUse',
    session_id: 'sess_manual_codex_hook',
    cwd: '/tmp/demo',
    tool_name: 'Bash',
    tool_use_id: 'tool-1',
    tool_input: { command: 'echo secret-value' },
    tool_response: { exit_code: 0, stdout: 'secret-output\n', stderr: '' },
  }, {
    LINX_SYMPHONY_HOOK_EVENTS: eventsPath,
  })

  assert.equal(result.status, 0)
  assert.equal(result.stdout, '')
  const [line] = readFileSync(eventsPath, 'utf-8').trim().split('\n')
  const event = JSON.parse(line)
  assert.equal(event.symphonyHookEvent, true)
  assert.equal(event.source, 'codex-native-hook')
  assert.equal(event.hookEventName, 'PostToolUse')
  assert.equal(event.sessionId, 'sess_manual_codex_hook')
  assert.equal(event.toolName, 'Bash')
  assert.equal(event.toolInput.commandLength, 'echo secret-value'.length)
  assert.equal(typeof event.toolInput.commandSha256, 'string')
  assert.equal(event.toolResponse.exitCode, 0)
  assert.equal(event.toolResponse.stdout.length, 'secret-output\n'.length)
  assert.equal(JSON.stringify(event).includes('secret-value'), false)
  assert.equal(JSON.stringify(event).includes('secret-output'), false)
})

test('symphony Codex native hook no-ops without explicit event stream configuration', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-codex-hook-unconfigured-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const noConfigPath = join(root, 'not-configured.jsonl')
  const noConfig = runHook(sourceScript, { hook_event_name: 'Stop', session_id: 'sess_no_config' }, {
    LINX_SYMPHONY_HOOK_EVENTS: '',
  })
  assert.equal(noConfig.status, 0)
  assert.equal(noConfig.stdout, '')
  assert.equal(existsSync(noConfigPath), false)
})
