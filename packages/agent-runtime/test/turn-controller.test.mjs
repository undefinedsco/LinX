import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BASE_ACP_AGENT_CAPABILITIES,
  DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID,
  DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_POLICY,
  DEFAULT_LINX_CHATKIT_AGENT_CAPABILITIES,
  DEFAULT_AUTO_MODE_SECRETARY_RULES,
  GROUP_AGENT_TURN_RULE,
  LINX_RUNTIME_ENDPOINTS,
  AUTO_MODE_SECRETARY_APPROVAL_RULE,
  AUTO_MODE_SECRETARY_INPUT_RULE,
  createAcpAgentCapabilities,
  createLinxChatKitAgentCapabilities,
  findMentionedGroupAgents,
  getLinxRuntimeEndpoint,
  isLinxRuntimeEndpointId,
  linxRuntimeEndpointForBackend,
  routeGroupTurn,
  supportsAgentRuntimeCapability,
} from '../dist/index.js'

test('ACP defaults are conservative runtime capabilities', () => {
  assert.equal(BASE_ACP_AGENT_CAPABILITIES.protocol, 'acp')
  assert.equal(BASE_ACP_AGENT_CAPABILITIES.canStartSession, true)
  assert.equal(BASE_ACP_AGENT_CAPABILITIES.canReceiveEvents, true)
  assert.equal(BASE_ACP_AGENT_CAPABILITIES.hasApprovals, true)
  assert.equal(BASE_ACP_AGENT_CAPABILITIES.canSetModel, false)

  const codexLike = createAcpAgentCapabilities({ hasThinking: true })
  assert.equal(codexLike.protocol, 'acp')
  assert.equal(codexLike.hasThinking, true)
  assert.equal(codexLike.canSetModel, false)
  assert.equal(supportsAgentRuntimeCapability(codexLike, 'approval.request'), true)
  assert.equal(supportsAgentRuntimeCapability(codexLike, 'model.set'), false)
})

test('ChatKit defaults expose full local agent runtime controls', () => {
  const chatkit = createLinxChatKitAgentCapabilities()
  assert.deepEqual(chatkit, DEFAULT_LINX_CHATKIT_AGENT_CAPABILITIES)
  assert.equal(supportsAgentRuntimeCapability(chatkit, 'message.inject'), true)
  assert.equal(supportsAgentRuntimeCapability(chatkit, 'control.interrupt'), true)
  assert.equal(supportsAgentRuntimeCapability(chatkit, 'model.set'), true)
})

test('fast companion model policy is shared beyond turn control', () => {
  assert.equal(DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID, 'linx-lite')
  assert.deepEqual(DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_POLICY, {
    modelId: 'linx-lite',
    tasks: [
      'turn.route',
      'approval.judge',
      'input.answer',
      'context.summarize',
      'title.generate',
      'retrieval.rank',
    ],
  })
})

test('LinX runtime endpoints treat ACP as an adapter instead of the internal bus', () => {
  assert.deepEqual(LINX_RUNTIME_ENDPOINTS, ['linx', 'acp:codex', 'acp:claude', 'acp:codebuddy'])
  assert.equal(linxRuntimeEndpointForBackend('linx'), 'linx')
  assert.equal(linxRuntimeEndpointForBackend('codex'), 'acp:codex')
  assert.equal(linxRuntimeEndpointForBackend('claude'), 'acp:claude')
  assert.equal(linxRuntimeEndpointForBackend('codebuddy'), 'acp:codebuddy')
  assert.equal(isLinxRuntimeEndpointId('automode'), false)
  assert.equal(isLinxRuntimeEndpointId('acp:codex'), true)
  assert.deepEqual(getLinxRuntimeEndpoint('linx'), {
    id: 'linx',
    protocol: 'linx',
    backend: 'linx',
    label: 'LinX',
  })
})

test('auto-mode secretary turn-controller rules are explicit and user-visible', () => {
  assert.deepEqual(DEFAULT_AUTO_MODE_SECRETARY_RULES, [
    AUTO_MODE_SECRETARY_APPROVAL_RULE,
    AUTO_MODE_SECRETARY_INPUT_RULE,
  ])

  assert.equal(AUTO_MODE_SECRETARY_APPROVAL_RULE.trigger, 'approval.required')
  assert.equal(AUTO_MODE_SECRETARY_APPROVAL_RULE.targetAgent, 'ai-secretary')
  assert.deepEqual(AUTO_MODE_SECRETARY_APPROVAL_RULE.requiredCapabilities, [
    'approval.request',
    'approval.options',
  ])
  assert.equal(AUTO_MODE_SECRETARY_APPROVAL_RULE.context.includeCurrentApproval, true)
  assert.equal(AUTO_MODE_SECRETARY_APPROVAL_RULE.context.includeMatchingGrants, true)
  assert.deepEqual(AUTO_MODE_SECRETARY_APPROVAL_RULE.allowedOutputs, [
    'chat_message',
    'approval_decision',
    'control_command',
  ])
  assert.deepEqual(AUTO_MODE_SECRETARY_APPROVAL_RULE.allowedControls, [
    'inject_message',
    'pause',
    'stop',
  ])
  assert.equal(AUTO_MODE_SECRETARY_APPROVAL_RULE.requiresUserVisibleTrace, true)

  assert.equal(AUTO_MODE_SECRETARY_INPUT_RULE.trigger, 'input.required')
  assert.deepEqual(AUTO_MODE_SECRETARY_INPUT_RULE.requiredCapabilities, ['input.structured'])
  assert.equal(AUTO_MODE_SECRETARY_INPUT_RULE.context.includeCurrentApproval, false)
  assert.deepEqual(AUTO_MODE_SECRETARY_INPUT_RULE.allowedOutputs, [
    'chat_message',
    'input_answer',
    'control_command',
  ])
  assert.deepEqual(AUTO_MODE_SECRETARY_INPUT_RULE.allowedControls, ['inject_message'])
  assert.equal(AUTO_MODE_SECRETARY_INPUT_RULE.requiresUserVisibleTrace, true)
})

test('group turn routing gives explicit mentions deterministic priority', async () => {
  const agents = [
    { id: 'agent-a', name: 'Planner', aliases: ['规划'] },
    { id: 'agent-b', name: 'Coder', aliases: ['代码'] },
  ]

  assert.deepEqual(findMentionedGroupAgents('@Coder 帮我看一下', agents), [agents[1]])

  const route = await routeGroupTurn({
    latestUserMessage: '@代码 帮我改一下',
    agents,
    coordinationId: 'turn-1',
    decide: async () => {
      throw new Error('controller should not run for explicit mentions')
    },
  })

  assert.deepEqual(route, {
    shouldReply: true,
    targetAgentIds: ['agent-b'],
    routedBy: 'mention',
    coordinationId: 'turn-1',
    reason: 'User explicitly mentioned one or more AI agents.',
    confidence: 1,
  })
})

test('group turn routing delegates unmentioned multi-agent turns to controller', async () => {
  const route = await routeGroupTurn({
    latestUserMessage: '这个接口该怎么拆？',
    agents: [
      {
        id: 'agent-a',
        uri: 'https://pod.example/.data/agents/planner.ttl#this',
        name: 'Planner',
        description: 'Plans architecture changes.',
        tags: ['architecture'],
        capabilityNames: ['design'],
      },
      {
        id: 'agent-b',
        uri: 'https://pod.example/.data/agents/coder.ttl#this',
        name: 'Coder',
        description: 'Implements code changes.',
        tags: ['implementation'],
        capabilityNames: ['edit'],
      },
    ],
    history: [{ role: 'user', content: '先讨论架构' }],
    coordinationId: 'turn-2',
    decide: async ({ latestUserMessage, agents, history }) => {
      assert.equal(latestUserMessage, '这个接口该怎么拆？')
      assert.equal(history.length, 1)
      assert.deepEqual(agents[0], {
        id: 'agent-a',
        uri: 'https://pod.example/.data/agents/planner.ttl#this',
        name: 'Planner',
        description: 'Plans architecture changes.',
        tags: ['architecture'],
        capabilityNames: ['design'],
      })
      assert.equal('instructions' in agents[0], false)
      assert.equal('tools' in agents[0], false)
      return {
        shouldReply: true,
        targetAgentIds: ['agent-a'],
        reason: 'Planning question',
        confidence: 0.82,
      }
    },
  })

  assert.deepEqual(route, {
    shouldReply: true,
    targetAgentIds: ['agent-a'],
    routedBy: 'controller',
    coordinationId: 'turn-2',
    reason: 'Planning question',
    confidence: 0.82,
  })
})

test('group turn routing can choose silence without a controller', async () => {
  const route = await routeGroupTurn({
    latestUserMessage: '我先自己看一下',
    agents: [
      { id: 'agent-a', name: 'Planner' },
      { id: 'agent-b', name: 'Coder' },
    ],
    coordinationId: 'turn-3',
  })

  assert.equal(route.shouldReply, false)
  assert.deepEqual(route.targetAgentIds, [])
  assert.equal(route.routedBy, 'none')
})

test('group turn controller rule is a user-message router', () => {
  assert.equal(GROUP_AGENT_TURN_RULE.trigger, 'user.message')
  assert.equal(GROUP_AGENT_TURN_RULE.targetAgent, 'agent-turn-controller')
  assert.deepEqual(GROUP_AGENT_TURN_RULE.allowedOutputs, ['chat_message'])
  assert.equal(GROUP_AGENT_TURN_RULE.requiresUserVisibleTrace, false)
})
