import test from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { loadWatchModule } from './watch-test-bundle.mjs'

test('codex attach runner pumps codex request lines through xpod bridge responses', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/codex-plugin/runner.ts')
  t.after(() => cleanup())

  const input = new PassThrough()
  const outputChunks = []
  const logChunks = []

  const runner = module.createCodexAttachRunner({
    backendSessionId: 'sess_codex_attach_runner',
    workspacePath: '/tmp/demo',
    input,
    output: {
      write(chunk) {
        outputChunks.push(String(chunk))
        return true
      },
    },
    log: {
      write(chunk) {
        logChunks.push(String(chunk))
        return true
      },
    },
    runtime: {
      async createRemoteWatchApproval() {
        return { id: 'approval_runner_1' }
      },
      async waitForRemoteWatchApproval() {
        return 'accept_for_session'
      },
    },
  })

  const runPromise = runner.run()
  input.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 9,
    method: 'item/commandExecution/requestApproval',
    params: {
      command: 'pwd',
      cwd: '/tmp/demo',
    },
  })}\n`)
  input.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'turn/completed',
  })}\n`)
  input.end()

  const exitCode = await runPromise
  assert.equal(exitCode, 0)
  assert.match(logChunks.join(''), /background codex attach active/)
  assert.deepEqual(outputChunks, [
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: 9,
      result: { decision: 'acceptForSession' },
    })}\n`,
  ])
  assert.equal(runner.record.backend, 'codex')
  assert.equal(runner.record.cwd, '/tmp/demo')
  assert.equal(runner.record.transport, 'acp')
  assert.equal(runner.record.backendSessionId, 'sess_codex_attach_runner')
})
