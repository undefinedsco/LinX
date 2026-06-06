import assert from 'node:assert/strict'
import test from 'node:test'
import { MessageVocab, SIOC, ThreadVocab, UDFS, WF } from '@undefineds.co/models'
import { createLinxPiCodingTools } from '../dist/lib/pi-adapter/runtime.js'

const CREDENTIAL_SCHEMA_URI = 'https://undefineds.co/ns#Credential'
const API_KEY_PREDICATE_URI = 'https://undefineds.co/ns#apiKey'

test('LinX consumed models keep Solid Chat compatibility predicates', () => {
  assert.equal(ThreadVocab.scope, UDFS.inScope)
  assert.equal(ThreadVocab.chat, SIOC.has_parent)
  assert.equal(MessageVocab.scope, UDFS.inScope)
  assert.equal(MessageVocab.chat, WF.message)
  assert.equal(MessageVocab.thread, SIOC.has_member)
})

test('LinX bash tool can query injected udfs schema without shelling back into linx', async () => {
  const tools = createLinxPiCodingTools(process.cwd())
  const bashTool = tools.find((tool) => tool.name === 'bash')
  assert.ok(bashTool)

  const result = await bashTool.execute('tool-call-udfs-cli', {
    command: `udfs schema describe ${CREDENTIAL_SCHEMA_URI}`,
    timeout: 5,
  })

  const text = JSON.stringify(result)
  assert.match(text, new RegExp(CREDENTIAL_SCHEMA_URI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.ok(text.includes('/settings/credentials.ttl'))
})

test('LinX bash tool can query injected udfs predicates', async () => {
  const tools = createLinxPiCodingTools(process.cwd())
  const bashTool = tools.find((tool) => tool.name === 'bash')
  assert.ok(bashTool)

  const result = await bashTool.execute('tool-call-udfs-predicates', {
    command: `udfs schema predicates --uri ${CREDENTIAL_SCHEMA_URI} --field apiKey`,
    timeout: 5,
  })

  const text = JSON.stringify(result)
  assert.match(text, /apiKey/)
  assert.match(text, new RegExp(API_KEY_PREDICATE_URI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
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
  assert.match(text, new RegExp(CREDENTIAL_SCHEMA_URI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.ok(text.includes('/settings/credentials.ttl'))
})
