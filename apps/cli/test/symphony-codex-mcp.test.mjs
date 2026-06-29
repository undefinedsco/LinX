import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('symphony Codex MCP server exposes delivery and reconciler tools', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-codex-mcp-'))
  const podRoot = join(root, '.pod')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/symphony-mcp.ts')
  t.after(() => cleanup())

  const server = module.createSymphonyCodexMcpServer({
    env: {
      LINX_POD_MIRROR_ROOT: podRoot,
    },
    output: { write() {} },
    err: { write() {} },
  })

  const initialize = await server.handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-03-26' },
  })
  assert.equal(initialize.result.serverInfo.name, 'linx-symphony')
  assert.equal(initialize.result.capabilities.tools.listChanged, false)

  const listed = await server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  const tools = listed.result.tools.map((tool) => tool.name)
  assert.deepEqual(tools, [
    'delivery_status',
    'validate_delivery',
    'submit_delivery',
    'reconcile',
  ])

  const status = await server.handleMessage({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'delivery_status', arguments: {} },
  })
  assert.equal(status.result.structuredContent.configured, true)
  assert.equal(status.result.structuredContent.podRoot, podRoot)

  const validate = await server.handleMessage({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'validate_delivery',
      arguments: {
        delivery: {
          status: 'completed',
          exitCode: 0,
          autoModeSessionId: 'sess_manual_codex',
          events: [{ type: 'run.step', message: 'manual codex verified delivery' }],
          report: { summary: 'Manual Codex report', evidence: ['mcp'] },
        },
      },
    },
  })
  assert.equal(validate.result.structuredContent.valid, true)
  assert.equal(validate.result.structuredContent.eventCount, 1)
  assert.equal(validate.result.structuredContent.hasReport, true)

  const written = await server.handleMessage({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'submit_delivery',
      arguments: {
        status: 'completed',
        exitCode: 0,
        autoModeSessionId: 'sess_manual_codex',
        events: [{ type: 'run.step', message: 'manual codex submitted delivery through MCP' }],
        report: { summary: 'Manual Codex delivery through MCP', evidence: ['mcp-submit'] },
      },
    },
  })
  assert.equal(written.result.structuredContent.submitted, true)
  assert.equal(written.result.structuredContent.podRoot, podRoot)
  assert.equal(existsSync(written.result.structuredContent.deliveryFile), true)
  assert.equal(existsSync(written.result.structuredContent.reportFile), true)
  const delivery = JSON.parse(readFileSync(written.result.structuredContent.deliveryFile, 'utf-8'))
  assert.equal(delivery.symphonyDelivery, true)
  assert.equal(delivery.status, 'completed')
  assert.equal(delivery.autoModeSessionId, 'sess_manual_codex')
  assert.match(readFileSync(written.result.structuredContent.reportFile, 'utf-8'), /Manual Codex delivery through MCP/)
  assert.equal(readdirSync(podRoot).includes('symphony'), true)
})

test('symphony Codex MCP thread reconciler uses shared Symphony policy logic', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-codex-mcp-reconcile-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/symphony-mcp.ts')
  t.after(() => cleanup())

  const server = module.createSymphonyCodexMcpServer({
    env: {},
    output: { write() {} },
    err: { write() {} },
  })

  const reconciled = await server.handleMessage({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'reconcile',
      arguments: {
        chat: 'codex://chat/symphony',
        thread: 'codex://thread/symphony-root',
        randomId: 'codex-mcp-delivery',
        events: [{
          type: 'delivery.submitted',
          resource: 'urn:undefineds:linx:symphony/deliveries/codex-worker',
          actor: { role: 'worker', id: 'codex-worker' },
          content: 'Codex worker submitted a delivery for Secretary review.',
          data: {
            status: 'completed',
            reportSummary: 'Codex MCP reconciler smoke report',
          },
        }],
      },
    },
  })

  assert.equal(reconciled.result.structuredContent.eventCount, 1)
  assert.equal(reconciled.result.structuredContent.thread, 'codex://thread/symphony-root')
  assert.equal(reconciled.result.structuredContent.policyKind, 'symphony')
  assert.equal(reconciled.result.structuredContent.nextAction, 'wake_secretary')
  assert.equal(reconciled.result.structuredContent.decisions.length, 1)
  assert.equal(reconciled.result.structuredContent.decisions[0].eventType, 'delivery.submitted')
  assert.equal(reconciled.result.structuredContent.decisions[0].wakeJobs[0].targetAgent, '__secretary__')
  assert.equal(reconciled.result.structuredContent.decisions[0].wakeJobs[0].targetRole, 'secretary')
  assert.match(reconciled.result.structuredContent.summary, /wake Secretary/i)
})

test('symphony Codex MCP server rejects invalid deliveries without writing', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-symphony-codex-mcp-invalid-'))
  const podRoot = join(root, '.pod')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/symphony-mcp.ts')
  t.after(() => cleanup())

  const server = module.createSymphonyCodexMcpServer({
    env: { LINX_POD_MIRROR_ROOT: podRoot },
    output: { write() {} },
    err: { write() {} },
  })
  const result = await server.handleMessage({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: { name: 'submit_delivery', arguments: { delivery: { note: 'not a report' } } },
  })
  assert.equal(result.error.code, -32000)
  assert.match(result.error.message, /Invalid Symphony Delivery/)
  assert.equal(existsSync(podRoot), false)
})
