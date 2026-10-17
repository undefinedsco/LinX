import { describe, expect, it } from 'vitest'
import { grantAppliesToAgent, readGrantAgent, writeGrantAgentContext } from './grant-agent'

const AGENT = 'https://pod.example/alice/data/agents/linx.ttl#it'

describe('grant assistant', () => {
  it('records the assistant in the grant context and reads it back', () => {
    const context = writeGrantAgentContext(null, AGENT)
    expect(readGrantAgent({ context })).toBe(AGENT)
    expect(writeGrantAgentContext('{"note":"x"}', AGENT)).toContain('"note":"x"')
    expect(writeGrantAgentContext(null, null)).toBeUndefined()
  })

  it('shows grants without an assistant for everyone, others only for theirs', () => {
    const own = { context: writeGrantAgentContext(null, AGENT) }
    const other = { context: writeGrantAgentContext(null, 'https://pod.example/alice/data/agents/other.ttl#it') }
    const general = { context: null }
    expect(grantAppliesToAgent(own, [AGENT])).toBe(true)
    expect(grantAppliesToAgent(other, [AGENT])).toBe(false)
    expect(grantAppliesToAgent(general, [AGENT])).toBe(true)
    expect(grantAppliesToAgent(other, [])).toBe(true)
  })

  it('matches an assistant given by short id', () => {
    expect(grantAppliesToAgent({ context: writeGrantAgentContext(null, 'https://pod.example/data/agents/a1.ttl#a1') }, ['a1'])).toBe(true)
  })
})
