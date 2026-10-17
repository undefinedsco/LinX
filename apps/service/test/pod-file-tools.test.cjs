const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { spawn } = require('node:child_process')
const { resolveCompiledServiceModule } = require('./helpers.cjs')

const MODULES = [
  'lib/runtime-threads.js',
  'lib/runtime-runner.js',
  'lib/runtime-runner-mock.js',
  'lib/runtime-workspace.js',
  'lib/xpod-chatkit-runtime.js',
  'lib/pod-file-tools.js',
  'lib/linx-paths.js',
]

function loadRuntime(t, acpModule) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-file-tools-'))
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return { app: { getPath: () => tmpDir, getName: () => 'LinX File Tools Test' } }
    }
    if (String(request).endsWith('/AcpAgentRuntime.js')) return acpModule
    if (String(request).endsWith('/GitWorktreeService.js')) {
      return { GitWorktreeService: class { async assertGitRepo() {} async createWorktree() {} } }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  const clear = () => {
    for (const relative of MODULES) {
      delete require.cache[require.resolve(resolveCompiledServiceModule(relative))]
    }
  }
  t.after(() => {
    Module._load = originalLoad
    fs.rmSync(tmpDir, { recursive: true, force: true })
    clear()
  })
  clear()
  return require(resolveCompiledServiceModule('lib/runtime-threads.js'))
}

function fileTools() {
  return require(resolveCompiledServiceModule('lib/pod-file-tools.js'))
}

test('the four file tools are declared with the argument shapes the web executor reads', () => {
  const { POD_FILE_TOOLS, POD_FILE_TOOLS_SYSTEM_PROMPT } = fileTools()
  const byName = Object.fromEntries(POD_FILE_TOOLS.map((tool) => [tool.name, tool]))
  assert.deepEqual(Object.keys(byName).sort(), ['files_add_column', 'files_create', 'files_edit', 'files_set_cell'])
  assert.deepEqual(byName.files_create.inputSchema.required, ['uri', 'content'])
  assert.deepEqual(Object.keys(byName.files_create.inputSchema.properties).sort(), ['content', 'mime_type', 'uri'])
  assert.deepEqual(byName.files_edit.inputSchema.required, ['uri', 'content'])
  assert.deepEqual(byName.files_set_cell.inputSchema.required, ['document', 'subject', 'predicate', 'values'])
  assert.ok('previous_values' in byName.files_set_cell.inputSchema.properties)
  assert.ok('row_added' in byName.files_set_cell.inputSchema.properties)
  assert.deepEqual(byName.files_add_column.inputSchema.required, ['document', 'predicate', 'label'])
  assert.ok('value_type' in byName.files_add_column.inputSchema.properties)
  for (const tool of POD_FILE_TOOLS) {
    assert.match(tool.description, /[一-鿿]/, `${tool.name} has a Chinese description`)
    assert.match(tool.description, /[A-Za-z]{5,}/, `${tool.name} has an English description`)
  }
  assert.match(byName.files_edit.description, /未确认草稿/)
  assert.match(byName.files_edit.description, /unconfirmed drafts/)
  assert.match(POD_FILE_TOOLS_SYSTEM_PROMPT, /未确认草稿/)
})

test('the MCP handler lists the tools and forwards calls', async () => {
  const { handlePodFileToolsMcpMessage, POD_FILE_TOOLS } = fileTools()
  const calls = []
  const forward = async (name, args) => { calls.push({ name, args }); return 'queued' }
  const init = await handlePodFileToolsMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, forward)
  assert.equal(init.result.protocolVersion, '2025-03-26')
  assert.equal(await handlePodFileToolsMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, forward), null)
  const list = await handlePodFileToolsMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, forward)
  assert.equal(list.result.tools.length, POD_FILE_TOOLS.length)
  const call = await handlePodFileToolsMcpMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'files_edit', arguments: { uri: 'u', content: 'c' } } }, forward)
  assert.equal(call.result.content[0].text, 'queued')
  assert.deepEqual(calls, [{ name: 'files_edit', args: { uri: 'u', content: 'c' } }])
  const unknown = await handlePodFileToolsMcpMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'rm_rf' } }, forward)
  assert.equal(unknown.result.isError, true)
  assert.equal(calls.length, 1)
})

/** Talks to the real compiled MCP stdio server, the way an ACP agent would. */
async function callThroughMcpServer(mcpServer, toolName, args) {
  const child = spawn(mcpServer.command, mcpServer.args, {
    env: { ...process.env, ...mcpServer.env },
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  const pending = new Map()
  let buffer = ''
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString()
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      if (!line.trim()) continue
      const message = JSON.parse(line)
      pending.get(message.id)?.(message)
    }
  })
  const rpc = (id, method, params) => new Promise((resolve) => {
    pending.set(id, resolve)
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
  try {
    await rpc(1, 'initialize', { protocolVersion: '2024-11-05' })
    const list = await rpc(2, 'tools/list', {})
    const result = await rpc(3, 'tools/call', { name: toolName, arguments: args })
    return { tools: list.result.tools.map((tool) => tool.name), text: result.result.content[0].text }
  } finally {
    child.kill()
  }
}

test('a model file edit streams out as a tool_call and the client result reaches the model', async (t) => {
  const runs = []
  let mcpReply
  class FakeAcpAgentRuntime {
    async *run(input) {
      runs.push(input)
      const agentConfig = input.config.agentConfig
      if (runs.length === 1) {
        yield { type: 'text', text: '好的，我来改。' }
        mcpReply = await callThroughMcpServer(agentConfig.mcpServers.linx_files, 'files_edit', {
          uri: 'https://pod.example/docs/plan.md',
          content: '# new',
        })
        // A real agent would keep talking; the runner must have ended the turn by now.
        await new Promise((resolve) => setTimeout(resolve, 200))
        yield { type: 'text', text: '（本轮结束后的多余内容）' }
      } else {
        yield { type: 'text', text: '改好了草稿，等你保留。' }
      }
    }
  }
  const { RuntimeThreadsModule } = loadRuntime(t, { AcpAgentRuntime: FakeAcpAgentRuntime })
  const runtime = new RuntimeThreadsModule()
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-file-tools-folder-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
  const session = runtime.createSession({
    threadId: 'thread-file-tools',
    title: 'File tools',
    repoPath: folder,
    runnerType: 'xpod-pty',
    tool: 'codex',
  })
  await runtime.startSession(session.id)

  const events = []
  runtime.subscribeSession(session.id, (event) => events.push(event))
  const waitFor = (predicate) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timed out')), 5000)
    const timer = setInterval(() => {
      const found = events.find(predicate)
      if (found) { clearTimeout(timeout); clearInterval(timer); resolve(found) }
    }, 20)
  })

  await runtime.sendSessionMessage(session.id, '把计划改一下')
  const toolCall = await waitFor((event) => event.type === 'tool_call')
  assert.equal(toolCall.name, 'files_edit')
  assert.deepEqual(JSON.parse(toolCall.arguments), { uri: 'https://pod.example/docs/plan.md', content: '# new' })
  assert.match(toolCall.requestId, /^linx-file:/)

  await waitFor(() => mcpReply)
  // Declared to the model: all four tools plus the draft system-prompt note.
  assert.deepEqual(mcpReply.tools.sort(), ['files_add_column', 'files_create', 'files_edit', 'files_set_cell'])
  assert.match(mcpReply.text, /不要说已经改好/)
  assert.match(runs[0].config.agentConfig.skillsContent, /未确认草稿/)
  assert.equal(events.filter((event) => event.type === 'assistant_delta' && /多余/.test(event.text)).length, 0)

  const output = '已作为未确认草稿，等用户保留。文件现在还是原样，请不要当作已生效。'
  await runtime.respondToSessionToolCall(session.id, toolCall.requestId, output)
  await waitFor((event) => event.type === 'assistant_done' && /草稿/.test(event.text))
  assert.equal(runs.length, 2)
  assert.ok(runs[1].prompt.includes(output), 'the draft notice reaches the model verbatim')
  assert.ok(runs[1].prompt.includes('把计划改一下'), 'the original request is repeated (stateless turns)')
  assert.ok(runs[1].prompt.includes('files_edit'))
})

test('LINX_DISABLE_FILE_TOOLS turns the file tools off', async (t) => {
  const runs = []
  class FakeAcpAgentRuntime {
    async *run(input) { runs.push(input); yield { type: 'text', text: 'ok' } }
  }
  process.env.LINX_DISABLE_FILE_TOOLS = '1'
  t.after(() => { delete process.env.LINX_DISABLE_FILE_TOOLS })
  const { RuntimeThreadsModule } = loadRuntime(t, { AcpAgentRuntime: FakeAcpAgentRuntime })
  const runtime = new RuntimeThreadsModule()
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-file-tools-off-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
  const session = runtime.createSession({ threadId: 'thread-off', title: 'off', repoPath: folder, runnerType: 'xpod-pty', tool: 'codex' })
  await runtime.startSession(session.id)
  const done = new Promise((resolve) => {
    const unsubscribe = runtime.subscribeSession(session.id, (event) => {
      if (event.type === 'assistant_done') { unsubscribe(); resolve() }
    })
  })
  await runtime.sendSessionMessage(session.id, 'hi')
  await done
  assert.equal(runs[0].config.agentConfig, undefined)
})
