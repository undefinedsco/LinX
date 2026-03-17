import test from 'node:test'
import assert from 'node:assert/strict'

test('resolveRuntimeTarget maps official cloud identity issuers to api.undefineds.co runtime', async () => {
  const { resolveRuntimeTarget } = await import('../dist/lib/runtime-target.js')

  assert.deepEqual(resolveRuntimeTarget({
    issuerUrl: 'https://id.undefineds.co/',
  }), {
    oidcIssuer: 'https://id.undefineds.co/',
    runtimeUrl: 'https://api.undefineds.co',
  })
})

test('resolveRuntimeTarget keeps self-hosted issuers on the same runtime origin unless overridden', async () => {
  const { resolveRuntimeTarget } = await import('../dist/lib/runtime-target.js')

  assert.deepEqual(resolveRuntimeTarget({
    issuerUrl: 'https://alice.pods.undefineds.co/',
  }), {
    oidcIssuer: 'https://alice.pods.undefineds.co/',
    runtimeUrl: 'https://alice.pods.undefineds.co',
  })

  assert.deepEqual(resolveRuntimeTarget({
    issuerUrl: 'https://pods.undefineds.co/',
  }), {
    oidcIssuer: 'https://pods.undefineds.co/',
    runtimeUrl: 'https://pods.undefineds.co',
  })

  assert.deepEqual(resolveRuntimeTarget({
    issuerUrl: 'https://id.undefineds.co/',
    runtimeUrlOverride: 'https://runtime.internal/v1',
  }), {
    oidcIssuer: 'https://id.undefineds.co/',
    runtimeUrl: 'https://runtime.internal/v1',
  })
})
