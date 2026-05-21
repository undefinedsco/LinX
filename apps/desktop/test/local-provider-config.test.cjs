const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

test('local provider config maps public CSS_BASE_URL to a managed custom domain', () => {
  const { resolveManagedDomainFromEnv } = require(resolveCompiledDesktopModule('lib/local-provider-config.js'))

  assert.deepEqual(
    resolveManagedDomainFromEnv({ CSS_BASE_URL: 'https://node-0000.undefineds.co/' }),
    { type: 'custom', value: 'node-0000.undefineds.co' },
  )
})

test('local provider config keeps localhost CSS_BASE_URL device-only', () => {
  const { resolveManagedDomainFromEnv } = require(resolveCompiledDesktopModule('lib/local-provider-config.js'))

  assert.deepEqual(
    resolveManagedDomainFromEnv({ CSS_BASE_URL: 'http://localhost:5737/' }),
    { type: 'none' },
  )
})

test('local provider config keeps HTTP LAN CSS_BASE_URL device-only for LAN verification', () => {
  const { resolveManagedDomainFromEnv } = require(resolveCompiledDesktopModule('lib/local-provider-config.js'))

  assert.deepEqual(
    resolveManagedDomainFromEnv({ CSS_BASE_URL: 'http://192.168.1.10:5737/' }),
    { type: 'none' },
  )
})

test('local provider config preserves an existing managed custom domain when CSS_BASE_URL is local', () => {
  const {
    resolveEffectiveManagedDomain,
    resolveManagedDomainFromEnv,
  } = require(resolveCompiledDesktopModule('lib/local-provider-config.js'))

  const envDomain = resolveManagedDomainFromEnv({ CSS_BASE_URL: 'http://127.0.0.1:5737/' })
  assert.deepEqual(envDomain, { type: 'none' })
  assert.deepEqual(resolveEffectiveManagedDomain({
    mode: 'remote-ready',
    envDomain,
    existingDomain: { type: 'custom', value: 'pod.example.com' },
  }), { type: 'custom', value: 'pod.example.com' })
})

test('local provider config lets a new public CSS_BASE_URL override persisted device-only state', () => {
  const {
    resolveEffectiveManagedDomain,
    resolveEffectiveManagedTunnelToken,
    resolveManagedDomainFromEnv,
  } = require(resolveCompiledDesktopModule('lib/local-provider-config.js'))

  const env = {
    CSS_BASE_URL: 'https://pod.example.com/',
    LINX_TUNNEL_PROVIDER: 'cloudflare',
    CLOUDFLARE_TUNNEL_TOKEN: 'cf-token',
  }
  const domain = resolveEffectiveManagedDomain({
    mode: 'device-only',
    envDomain: resolveManagedDomainFromEnv(env),
    existingDomain: { type: 'none' },
  })

  assert.deepEqual(domain, { type: 'custom', value: 'pod.example.com' })
  assert.equal(resolveEffectiveManagedTunnelToken({
    env,
    mode: 'device-only',
    domain,
    existingTunnelToken: undefined,
  }), 'cf-token')
})

test('local provider config forwards Cloudflare token only for remote-ready local startup', () => {
  const { resolveManagedTunnelTokenFromEnv } = require(resolveCompiledDesktopModule('lib/local-provider-config.js'))

  assert.equal(
    resolveManagedTunnelTokenFromEnv({
      LINX_TUNNEL_PROVIDER: 'cloudflare',
      CLOUDFLARE_TUNNEL_TOKEN: ' cf-token ',
    }, 'remote-ready'),
    'cf-token',
  )
  assert.equal(
    resolveManagedTunnelTokenFromEnv({
      LINX_TUNNEL_PROVIDER: 'cloudflare',
      CLOUDFLARE_TUNNEL_TOKEN: 'cf-token',
    }, 'device-only'),
    undefined,
  )
})

test('local provider config ignores non-Cloudflare tunnel providers for cloudflared', () => {
  const { resolveManagedTunnelTokenFromEnv } = require(resolveCompiledDesktopModule('lib/local-provider-config.js'))

  assert.equal(
    resolveManagedTunnelTokenFromEnv({
      LINX_TUNNEL_PROVIDER: 'sakura',
      CLOUDFLARE_TUNNEL_TOKEN: 'cf-token',
    }, 'remote-ready'),
    undefined,
  )
})
