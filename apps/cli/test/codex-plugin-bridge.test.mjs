import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function useTempAutoModeHome(t) {
  const previous = process.env.LINX_AUTO_MODE_HOME
  const dir = mkdtempSync(join(tmpdir(), 'linx-auto-mode-home-'))
  process.env.LINX_AUTO_MODE_HOME = dir
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LINX_AUTO_MODE_HOME
    } else {
      process.env.LINX_AUTO_MODE_HOME = previous
    }
    rmSync(dir, { recursive: true, force: true })
  })
}

test('createCodexAttachSessionRecord creates a codex->xpod attach session', async (t) => {
  useTempAutoModeHome(t)
  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/bridge.ts')
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
  assert.equal(record.approvalSource, 'hybrid')
})

test('createCodexAttachSessionRecord prefers workspacePath over cwd and rejects missing path', async (t) => {
  useTempAutoModeHome(t)
  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/bridge.ts')
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
  useTempAutoModeHome(t)
  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/bridge.ts')
  t.after(() => cleanup())

  const record = module.createCodexAttachSessionRecord({
    workspacePath: '/tmp/demo',
    backendSessionId: 'sess_codex_attach_456',
  })

  const runtime = {
    materialized: [],
    async createRemoteAutoModeApproval({ request }) {
      assert.equal(request.kind, 'command-approval')
      assert.equal(request.command, 'pwd')
      return { id: 'approval_remote_1', approvalUri: 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_remote_1' }
    },
    async waitForRemoteAutoModeApproval({ approvalId }) {
      assert.equal(approvalId, 'approval_remote_1')
      return 'accept_for_session'
    },
    async materializeRemoteAutoModeGrant(payload) {
      this.materialized.push(payload)
      return { id: 'grant_remote_1' }
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

  assert.deepEqual({
    request: result.request,
    decision: result.decision,
    response: result.response,
  }, {
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
  assert.deepEqual(runtime.materialized, [{
    approvalId: 'approval_remote_1',
    approvalUri: 'https://alice.example/.data/approvals/2026/03/18.ttl#approval_remote_1',
  }])
  assert.equal(result.reconciler.policyKind, 'direct')
  assert.equal(result.reconciler.eventType, 'approval.required')
  assert.match(result.reconciler.skippedReason, /Policy direct does not wake/)

  const events = readFileSync(record.eventsFile, 'utf-8')
  assert.match(events, /Thread Reconciler dispatched command-approval/)
  assert.match(events, /"policyKind":"direct"/)
  assert.match(events, /"eventType":"approval.required"/)
  assert.match(events, /Thread Reconciler resolved command-approval/)
})

test('codex attach bridge routes auto-enabled approvals through Thread Reconciler Secretary wake', async (t) => {
  useTempAutoModeHome(t)
  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/bridge.ts')
  t.after(() => cleanup())

  const record = module.createCodexAttachSessionRecord({
    workspacePath: '/tmp/demo',
    backendSessionId: 'sess_codex_attach_auto',
  })
  record.autoEnabled = true
  record.mode = 'auto'

  const runtime = {
    remoteApprovalCalls: 0,
    async createRemoteAutoModeApproval() {
      this.remoteApprovalCalls += 1
      throw new Error('remote approval should not be used when Secretary auto-decides')
    },
    async waitForRemoteAutoModeApproval() {
      throw new Error('remote approval should not be used when Secretary auto-decides')
    },
    async resolveAutoModeSecretaryRecommendation({ request }) {
      assert.equal(request.kind, 'command-approval')
      return {
        kind: 'command-approval',
        canAutoDecide: true,
        decision: 'accept',
        confidence: 0.9,
        reason: 'read-only command',
        source: 'model',
      }
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

  assert.equal(result.decision, 'accept')
  assert.deepEqual(result.response, { decision: 'accept' })
  assert.equal(result.reconciler.policyKind, 'auto')
  assert.equal(result.reconciler.eventType, 'approval.required')
  assert.equal(result.reconciler.wakeJobs[0].targetAgent, '__secretary__')
  assert.equal(result.reconciler.wakeJobs[0].targetRole, 'secretary')
  assert.equal(runtime.remoteApprovalCalls, 0)

  const events = readFileSync(record.eventsFile, 'utf-8')
  assert.match(events, /Thread Reconciler dispatched command-approval/)
  assert.match(events, /"policyKind":"auto"/)
  assert.match(events, /"targetAgent":"__secretary__"/)
  assert.match(events, /Thread Reconciler resolved command-approval/)
})

test('codex attach bridge handles JSON-RPC lines and emits codex responses', async (t) => {
  useTempAutoModeHome(t)
  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/bridge.ts')
  t.after(() => cleanup())

  const record = module.createCodexAttachSessionRecord({
    workspacePath: '/tmp/demo',
    backendSessionId: 'sess_codex_attach_rpc',
  })

  const bridge = module.createCodexAttachBridge(record, {
    async createRemoteAutoModeApproval() {
      return { id: 'approval_rpc_1' }
    },
    async waitForRemoteAutoModeApproval() {
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
