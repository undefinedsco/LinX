import { describe, expect, it } from 'vitest'
import { normalizeClientToolCallItem, normalizeToolCallArguments } from '../tool-call-protocol'

// Regression: runtime events contain JSON strings, while ChatKit tool items
// require structured argument objects for rendering and history replay.
describe('ChatKit client tool call protocol', () => {
  it('converts runtime JSON arguments to an object', () => {
    expect(normalizeToolCallArguments('{"path":"/tmp/demo.txt","limit":3}')).toEqual({
      path: '/tmp/demo.txt',
      limit: 3,
    })
  })

  it('keeps malformed and non-object payloads inspectable without breaking the protocol', () => {
    expect(normalizeToolCallArguments('not-json')).toEqual({ raw: 'not-json' })
    expect(normalizeToolCallArguments('["one"]')).toEqual({ value: ['one'] })
    expect(normalizeToolCallArguments('')).toEqual({})
  })

  it('upgrades historical string-based client tool calls during replay', () => {
    expect(normalizeClientToolCallItem({
      id: 'tool-1',
      thread_id: 'thread-1',
      type: 'client_tool_call',
      name: 'read_file',
      arguments: '{"path":"package.json"}' as never,
      call_id: 'call-1',
      status: 'pending',
      created_at: 1,
    })).toMatchObject({
      arguments: { path: 'package.json' },
    })
  })
})
