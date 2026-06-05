import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AgentRuntimeTurnError,
  createAgentRuntime,
  createAgentRuntimeConfigSnapshot,
  resolveAgentRuntimeConfig,
} from '../src/agent-runtime'

test('agent runtime injects system prompt and records completed turns', async () => {
  const calls: Array<{
    agent: string
    model: string
    messages: Array<{ role: string; content: string; source?: string }>
    metadata?: Record<string, unknown>
  }> = []

  const runtime = createAgentRuntime({
    agent: '__secretary__',
    role: 'secretary',
    model: 'linx-lite',
    label: 'AI Secretary',
    systemPrompt: 'You are the LinX AI Secretary.',
    metadata: {
      mode: 'auto',
    },
  }, async (request) => {
    calls.push(request)
    return {
      content: '金玉满堂',
      reasoningContent: 'picked a matching idiom',
      finishReason: 'stop',
      usage: {
        input: 3,
        output: 1,
      },
      raw: {
        source: 'mock',
      },
    }
  })

  const turn = await runtime.runTurn({
    input: '我们玩成语接龙',
    trigger: 'agent.message',
    messages: [
      {
        role: 'user',
        source: 'user',
        content: '我们玩成语接龙',
      },
    ],
    metadata: {
      reason: 'auto-on',
    },
    now: () => new Date('2026-05-24T00:00:00.000Z'),
    randomId: 'turn-1234',
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].agent.agent, '__secretary__')
  assert.equal(calls[0].model, 'linx-lite')
  assert.equal(calls[0].messages[0].role, 'system')
  assert.equal(calls[0].messages[0].content, 'You are the LinX AI Secretary.')
  assert.equal(calls[0].messages[1].role, 'user')
  assert.equal(calls[0].messages[1].content, '我们玩成语接龙')
  assert.equal(calls[0].metadata?.mode, 'auto')
  assert.equal(calls[0].metadata?.reason, 'auto-on')

  assert.equal(turn.run.id, 'run_turn-1234')
  assert.equal(turn.run.agent, '__secretary__')
  assert.equal(turn.run.role, 'secretary')
  assert.equal(turn.run.status, 'completed')
  assert.equal(turn.run.output, '金玉满堂')
  assert.equal(turn.run.metadata?.label, 'AI Secretary')
  assert.equal(turn.run.metadata?.mode, 'auto')
  assert.equal(turn.run.metadata?.reason, 'auto-on')
  assert.deepEqual(turn.run.metadata?.runtimeSnapshot, {
    agent: '__secretary__',
    role: 'secretary',
    model: 'linx-lite',
    label: 'AI Secretary',
    metadata: {
      mode: 'auto',
    },
    source: 'agent-runtime.run',
    createdAt: '2026-05-24T00:00:00.000Z',
  })
  assert.deepEqual(turn.steps[0].data?.runtimeSnapshot, turn.run.metadata?.runtimeSnapshot)
  assert.equal(turn.steps.map((step) => step.stepType).join(','), 'run.created,runtime.input.prepared,runtime.output.completed')
  assert.equal(turn.steps[0].run, 'run_turn-1234')
  assert.equal(turn.content, '金玉满堂')
  assert.equal(turn.reasoningContent, 'picked a matching idiom')
  assert.equal(turn.finishReason, 'stop')
  assert.equal(turn.usage?.input, 3)
  assert.deepEqual(turn.raw, {
    source: 'mock',
  })
})

test('agent runtime surfaces failed turns with the generated run and steps', async () => {
  const runtime = createAgentRuntime({
    agent: '__secretary__',
    role: 'secretary',
    model: 'linx-lite',
    systemPrompt: 'You are the LinX AI Secretary.',
  }, async () => {
    throw new Error('service unavailable')
  })

  await assert.rejects(
    () => runtime.runTurn({
      input: '继续',
      messages: [
        {
          role: 'user',
          source: 'user',
          content: '继续',
        },
      ],
      now: () => new Date('2026-05-24T00:00:00.000Z'),
      randomId: 'turn-fail',
    }),
    (error: unknown) => {
      assert.ok(error instanceof AgentRuntimeTurnError)
      const turnError = error as AgentRuntimeTurnError
      assert.equal(turnError.run.id, 'run_turn-fail')
      assert.equal(turnError.run.status, 'failed')
      assert.equal(turnError.run.error, 'service unavailable')
      assert.equal(turnError.steps.map((step) => step.stepType).join(','), 'run.created,runtime.input.prepared,runtime.error')
      assert.equal(turnError.steps[2]?.message, 'service unavailable')
      return true
    },
  )
})

test('agent runtime resolves startup overrides over default runtime config', async () => {
  const resolved = resolveAgentRuntimeConfig({
    agent: '__secretary__',
    role: 'secretary',
    model: 'linx-lite',
    runtime: {
      backend: 'linx',
      model: 'linx-lite',
      credentialSource: 'cloud',
    },
    skills: [
      {
        id: '__secretary__/skills/symphony/',
        name: 'symphony',
        version: '0.1.0',
        enabled: true,
      },
    ],
    authorityPolicy: {
      approvals: 'session-only',
    },
    metadata: {
      mode: 'auto',
    },
  }, {
    model: 'gpt-5.5',
    runtime: {
      model: 'gpt-5.5',
      credentialSource: 'local',
    },
    toolPolicy: {
      shell: 'restricted',
    },
    metadata: {
      reason: 'startup-override',
    },
  })

  assert.equal(resolved.model, 'gpt-5.5')
  assert.deepEqual(resolved.runtime, {
    backend: 'linx',
    model: 'gpt-5.5',
    credentialSource: 'local',
  })
  assert.deepEqual(resolved.skills, [
    {
      id: '__secretary__/skills/symphony/',
      name: 'symphony',
      version: '0.1.0',
      enabled: true,
    },
  ])
  assert.deepEqual(resolved.authorityPolicy, {
    approvals: 'session-only',
  })
  assert.deepEqual(resolved.toolPolicy, {
    shell: 'restricted',
  })
  assert.deepEqual(resolved.metadata, {
    mode: 'auto',
    reason: 'startup-override',
  })

  assert.deepEqual(createAgentRuntimeConfigSnapshot(resolved, {
    createdAt: '2026-05-24T00:00:00.000Z',
    source: 'test',
  }), {
    agent: '__secretary__',
    role: 'secretary',
    model: 'gpt-5.5',
    runtime: {
      backend: 'linx',
      model: 'gpt-5.5',
      credentialSource: 'local',
    },
    credentialSource: 'local',
    skills: [
      {
        id: '__secretary__/skills/symphony/',
        name: 'symphony',
        version: '0.1.0',
        enabled: true,
      },
    ],
    authorityPolicy: {
      approvals: 'session-only',
    },
    toolPolicy: {
      shell: 'restricted',
    },
    metadata: {
      mode: 'auto',
      reason: 'startup-override',
    },
    source: 'test',
    createdAt: '2026-05-24T00:00:00.000Z',
  })

  const calls: Array<{ model: string; runtime?: unknown; metadata?: Record<string, unknown> }> = []
  const runtime = createAgentRuntime(resolved, async (request) => {
    calls.push({
      model: request.model,
      runtime: request.agent.runtime,
      metadata: request.metadata,
    })
    return { content: 'ok' }
  })

  const turn = await runtime.runTurn({
    messages: [{ role: 'user', content: 'ping' }],
    now: () => new Date('2026-05-24T00:00:00.000Z'),
    randomId: 'override',
  })

  assert.equal(calls[0]?.model, 'gpt-5.5')
  assert.deepEqual(calls[0]?.runtime, resolved.runtime)
  assert.deepEqual(calls[0]?.metadata?.runtime, resolved.runtime)
  assert.deepEqual(turn.run.runtime, resolved.runtime)
  assert.deepEqual(turn.run.metadata?.runtime, resolved.runtime)
  assert.deepEqual((turn.run.metadata?.runtimeSnapshot as Record<string, unknown>).runtime, resolved.runtime)
  assert.deepEqual((turn.run.metadata?.runtimeSnapshot as Record<string, unknown>).skills, resolved.skills)
})
