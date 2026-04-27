import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadWatchModule } from './watch-test-bundle.mjs'

function useTempWatchHome(t) {
  const previous = process.env.LINX_WATCH_HOME
  const dir = mkdtempSync(join(tmpdir(), 'linx-watch-home-'))
  process.env.LINX_WATCH_HOME = dir
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LINX_WATCH_HOME
    } else {
      process.env.LINX_WATCH_HOME = previous
    }
    rmSync(dir, { recursive: true, force: true })
  })
}

test('createCodexAttachSessionRecord creates a codex->xpod attach session', async (t) => {
  useTempWatchHome(t)
  const { module, cleanup } = await loadWatchModule('lib/codex-plugin/bridge.ts')
  t.after(() => cleanup())

  const record = module.createCodexAttachSessionRecord({
    workspacePath: '/tmp/demo',
    backendSessionId: 'sess_codex_attach_123',
    model: 'gpt-5-codex',
    prompt: 'inspect repo',
  })

  assert.equal(record.backend, 'codex')
  assert.equal(record.cwd, '/tmp/demo')
  assert.equal(record.backendSessionId, 'sess_codex_attach_123')
  assert.equal(record.transport, 'acp')
  assert.equal(record.approvalSource, 'remote')
})

test('createCodexAttachSessionRecord prefers workspacePath over cwd and rejects missing path', async (t) => {
  useTempWatchHome(t)
  const { module, cleanup } = await loadWatchModule('lib/codex-plugin/bridge.ts')
  t.after(() => cleanup())

  const preferred = module.createCodexAttachSessionRecord({
    workspacePath: '/tmp/workspace',
    cwd: '/tmp/legacy-cwd',
    backendSessionId: 'sess_codex_attach_preferred',
  })

  assert.equal(preferred.cwd, '/tmp/workspace')
  assert.throws(
    () => module.createCodexAttachSessionRecord({
      backendSessionId: 'sess_codex_attach_missing',
    }),
    /workspace path/i,
  )
})

test('codex attach bridge maps codex approval requests to xpod remote approvals and back', async (t) => {
  useTempWatchHome(t)
  const { module, cleanup } = await loadWatchModule('lib/codex-plugin/bridge.ts')
  t.after(() => cleanup())

  const record = module.createCodexAttachSessionRecord({
    workspacePath: '/tmp/demo',
    backendSessionId: 'sess_codex_attach_456',
  })

  const runtime = {
    async createRemoteWatchApproval({ request }) {
      assert.equal(request.kind, 'command-approval')
      assert.equal(request.command, 'pwd')
      return { id: 'approval_remote_1' }
    },
    async waitForRemoteWatchApproval({ approvalId }) {
      assert.equal(approvalId, 'approval_remote_1')
      return 'accept_for_session'
    },
  }

  const bridge = module.createCodexAttachBridge(record, runtime)
  const result = await bridge.handleCodexRequest({
    method: 'item/commandExecution/requestApproval',
    params: {
      command: 'pwd',
      cwd: '/tmp/demo',
    },
  })

  assert.deepEqual(result, {
    request: {
      kind: 'command-approval',
      message: 'pwd',
      command: 'pwd',
      cwd: '/tmp/demo',
      raw: {
        method: 'item/commandExecution/requestApproval',
        params: {
          command: 'pwd',
          cwd: '/tmp/demo',
        },
      },
    },
    decision: 'accept_for_session',
    response: { decision: 'acceptForSession' },
  })
})

test('codex attach bridge handles JSON-RPC lines and emits codex responses', async (t) => {
  useTempWatchHome(t)
  const { module, cleanup } = await loadWatchModule('lib/codex-plugin/bridge.ts')
  t.after(() => cleanup())

  const record = module.createCodexAttachSessionRecord({
    workspacePath: '/tmp/demo',
    backendSessionId: 'sess_codex_attach_rpc',
  })

  const bridge = module.createCodexAttachBridge(record, {
    async createRemoteWatchApproval() {
      return { id: 'approval_rpc_1' }
    },
    async waitForRemoteWatchApproval() {
      return 'decline'
    },
  })

  assert.deepEqual(
    await bridge.handleCodexRpcLine(JSON.stringify({
      jsonrpc: '2.0',
      id: 7,
      method: 'item/commandExecution/requestApproval',
      params: { command: 'rm -rf dist', cwd: '/tmp/demo' },
    })),
    [{
      jsonrpc: '2.0',
      id: 7,
      result: { decision: 'decline' },
    }],
  )

  assert.deepEqual(await bridge.handleCodexRpcLine('{not-json'), [])
  assert.deepEqual(await bridge.handleCodexRpcLine(JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed' })), [])
})
