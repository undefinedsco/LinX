import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  agentHomeDirFromResourceId,
  agentKeyFromResourceId,
  agentResourceId,
  asBaseRelativeResourceId,
  asResourceIri,
  requireRowResourceId,
} from '../src/pod-resource-identity.ts'

describe('pod resource identity', () => {
  it('uses directory-shaped Agent resource ids', () => {
    assert.equal(agentResourceId('__secretary__'), '__secretary__/')
    assert.equal(agentResourceId('agent-1'), 'agent-1/')
    assert.equal(agentResourceId('agent-1/'), 'agent-1/')
    assert.equal(agentKeyFromResourceId('agent-1/'), 'agent-1')
    assert.equal(agentHomeDirFromResourceId('agent-1/'), 'agent-1/')
  })

  it('rejects full IRIs and absolute paths as base-relative ids', () => {
    assert.throws(() => asBaseRelativeResourceId('https://example.test/agent/'), /base-relative/)
    assert.throws(() => asBaseRelativeResourceId('/agents/agent-1/'), /base-relative/)
    assert.equal(asBaseRelativeResourceId('agents/agent-1/'), 'agents/agent-1/')
  })

  it('requires full IRIs where a Resource IRI is expected', () => {
    assert.equal(asResourceIri('https://example.test/agents/agent-1/'), 'https://example.test/agents/agent-1/')
    assert.throws(() => asResourceIri('agents/agent-1/'), /full resource IRI/)
  })

  it('requires typed rows to carry row.id', () => {
    assert.equal(requireRowResourceId({ id: 'agent-1/' }), 'agent-1/')
    assert.throws(() => requireRowResourceId({ id: '' }), /missing row.id/)
  })
})
