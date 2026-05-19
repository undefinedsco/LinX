import assert from 'node:assert/strict'
import test from 'node:test'
import { createLinxPiCodingTools } from '../dist/lib/pi-adapter/runtime.js'

test('LinX bash tool can query injected udfs schema without shelling back into linx', async () => {
  const tools = createLinxPiCodingTools(process.cwd())
  const bashTool = tools.find((tool) => tool.name === 'bash')
  assert.ok(bashTool)

  const result = await bashTool.execute('tool-call-udfs-cli', {
    command: 'udfs schema describe https://vocab.xpod.dev/credential#Credential',
    timeout: 5,
  })

  const text = JSON.stringify(result)
  assert.match(text, /https:\/\/vocab\.xpod\.dev\/credential#Credential/)
  assert.ok(text.includes('/settings/credentials.ttl'))
})

test('LinX bash tool can query injected udfs predicates', async () => {
  const tools = createLinxPiCodingTools(process.cwd())
  const bashTool = tools.find((tool) => tool.name === 'bash')
  assert.ok(bashTool)

  const result = await bashTool.execute('tool-call-udfs-predicates', {
    command: 'udfs schema predicates --uri https://vocab.xpod.dev/credential#Credential --field apiKey',
    timeout: 5,
  })

  const text = JSON.stringify(result)
  assert.match(text, /apiKey/)
  assert.match(text, /https:\/\/vocab\.xpod\.dev\/credential#apiKey/)
})

test('LinX bash tool can pass JSON input to injected udfs consensus', async () => {
  const tools = createLinxPiCodingTools(process.cwd())
  const bashTool = tools.find((tool) => tool.name === 'bash')
  assert.ok(bashTool)

  const input = JSON.stringify({
    session_id: 'sess_tool_test',
    request: '我要保存这个 Cloudflare token',
    answers: {
      token_type: 'tunnel-token',
    },
  })
  const result = await bashTool.execute('tool-call-udfs-consensus', {
    command: `udfs consensus --input '${input}' --json`,
    timeout: 5,
  })

  const text = JSON.stringify(result)
  assert.match(text, /sess_tool_test/)
  assert.match(text, /schemaUri/)
  assert.match(text, /https:\/\/vocab\.xpod\.dev\/credential#Credential/)
  assert.ok(text.includes('/settings/credentials.ttl'))
})
