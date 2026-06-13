import assert from 'node:assert/strict'
import test from 'node:test'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('auto-mode Secretary runtime config anchors identity on the Agent root', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/auto-mode/secretary.ts')
  t.after(() => cleanup())

  const config = module.__autoModeSecretaryInternal.createSecretaryAgentRuntimeConfig({
    systemPrompt: 'system prompt',
    metadata: {
      cwd: '/tmp/linx',
    },
  })

  assert.equal(config.agent, '__secretary__')
  assert.equal(config.role, 'secretary')
  assert.equal(config.label, 'AI Secretary')
  assert.equal(config.runtime.backend, 'linx')
  assert.equal(config.runtime.credentialSource, 'cloud')
  assert.equal(typeof config.runtime.model, 'string')
  assert.equal(config.systemPrompt, 'system prompt')
  assert.deepEqual(config.metadata, {
    cwd: '/tmp/linx',
  })
})

test('auto-mode Secretary runtime config accepts explicit Agent runtime metadata overrides', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/auto-mode/secretary.ts')
  t.after(() => cleanup())

  const direct = module.__autoModeSecretaryInternal.resolveSecretaryRuntimeOverrides({
    metadata: {
      agentRuntime: {
        backend: 'linx',
        model: 'gpt-5.5',
        credentialSource: 'cloud',
        runtime: 'pi',
        transport: 'native',
        endpoint: 'https://api.undefineds.co/v1',
        metadata: {
          source: 'test',
        },
      },
    },
  })

  assert.deepEqual(direct, {
    model: 'gpt-5.5',
    runtime: {
      backend: 'linx',
      model: 'gpt-5.5',
      credentialSource: 'cloud',
      runtime: 'pi',
      transport: 'native',
      endpoint: 'https://api.undefineds.co/v1',
      metadata: {
        source: 'test',
      },
    },
  })

  const symphony = module.__autoModeSecretaryInternal.resolveSecretaryRuntimeOverrides({
    metadata: {
      symphony: {
        agentRuntime: {
          model: 'gpt-5.5-mini',
          credentialSource: 'cloud',
        },
      },
    },
  })

  assert.deepEqual(symphony, {
    model: 'gpt-5.5-mini',
    runtime: {
      model: 'gpt-5.5-mini',
      credentialSource: 'cloud',
    },
  })
})
