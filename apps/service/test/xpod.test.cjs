const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { resolveCompiledServiceModule } = require('./helpers.cjs')

function loadXpodWithStubs(t) {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => '/tmp/linx-service-xpod-test',
          getName: () => 'LinX Service Test',
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  const modulePath = resolveCompiledServiceModule('lib/xpod.js')
  delete require.cache[require.resolve(modulePath)]
  const mod = require(modulePath)

  t.after(() => {
    Module._load = originalLoad
    delete require.cache[require.resolve(modulePath)]
  })

  return mod
}

test('service xpod resolves external IdP from canonical oidcIssuer config', (t) => {
  const { resolveExternalOidcIssuer } = loadXpodWithStubs(t)
  const pollutionKey = ['OIDC', 'ISSUER'].join('_')

  assert.equal(resolveExternalOidcIssuer({
    oidcIssuer: 'https://id.undefineds.co/',
  }), 'https://id.undefineds.co/')

  assert.equal(resolveExternalOidcIssuer({
    [pollutionKey]: 'https://legacy-id.undefineds.co',
  }), undefined)

  assert.equal(resolveExternalOidcIssuer({}), undefined)
})

test('service xpod runtime env removes inherited OIDC env before applying explicit env', (t) => {
  const { buildRuntimeEnv } = loadXpodWithStubs(t)
  const pollutionKey = ['OIDC', 'ISSUER'].join('_')
  const originalLowerOidcIssuer = process.env.oidcIssuer
  const legacyOidcKey = `CSS_${pollutionKey}`
  const legacyCssIdpKey = `CSS_${['IDP', 'URL'].join('_')}`
  const legacyIdpKey = `XPOD_${['IDP', 'URL'].join('_')}`
  const originalOidcIssuer = process.env[pollutionKey]
  const originalLegacyOidc = process.env[legacyOidcKey]
  const originalLegacyCssIdp = process.env[legacyCssIdpKey]
  const originalLegacyIdp = process.env[legacyIdpKey]

  t.after(() => {
    if (originalOidcIssuer === undefined) delete process.env[pollutionKey]
    else process.env[pollutionKey] = originalOidcIssuer
    if (originalLowerOidcIssuer === undefined) delete process.env.oidcIssuer
    else process.env.oidcIssuer = originalLowerOidcIssuer
    if (originalLegacyOidc === undefined) delete process.env[legacyOidcKey]
    else process.env[legacyOidcKey] = originalLegacyOidc
    if (originalLegacyCssIdp === undefined) delete process.env[legacyCssIdpKey]
    else process.env[legacyCssIdpKey] = originalLegacyCssIdp
    if (originalLegacyIdp === undefined) delete process.env[legacyIdpKey]
    else process.env[legacyIdpKey] = originalLegacyIdp
  })

  process.env[pollutionKey] = 'https://inherited-id.undefineds.co'
  process.env.oidcIssuer = 'https://legacy.example.com'
  process.env[legacyOidcKey] = 'https://legacy-oidc.example.com'
  process.env[legacyCssIdpKey] = 'https://legacy-css-idp.example.com'
  process.env[legacyIdpKey] = 'https://legacy-idp.example.com'

  const env = buildRuntimeEnv({ CSS_BASE_URL: 'http://localhost:5737' }, { CSS_PORT: '5738' })

  assert.equal(env[pollutionKey], undefined)
  assert.equal(env.oidcIssuer, undefined)
  assert.equal(env[legacyOidcKey], undefined)
  assert.equal(env[legacyCssIdpKey], undefined)
  assert.equal(env[legacyIdpKey], undefined)
  assert.equal(env.CSS_BASE_URL, 'http://localhost:5737')
  assert.equal(env.CSS_PORT, '5738')
})

test('service xpod runtime env keeps explicit oidcIssuer from config', (t) => {
  const { buildRuntimeEnv } = loadXpodWithStubs(t)

  const env = buildRuntimeEnv({
    CSS_BASE_URL: 'https://node-0000.undefineds.co/',
    oidcIssuer: 'https://id.undefineds.co',
  })

  assert.equal(env.oidcIssuer, 'https://id.undefineds.co')
  assert.equal(env[['OIDC', 'ISSUER'].join('_')], undefined)
})

test('service embedded CSS runtime env keeps oidcIssuer out of CSS env', (t) => {
  const { buildCssRuntimeEnv } = loadXpodWithStubs(t)

  const env = buildCssRuntimeEnv({
    CSS_BASE_URL: 'http://localhost:5737',
    oidcIssuer: 'https://id.undefineds.co',
    [`CSS_${['OIDC', 'ISSUER'].join('_')}`]: 'https://legacy-oidc.example.com',
    [`CSS_${['IDP', 'URL'].join('_')}`]: 'https://legacy-css-idp.example.com',
    [['identity', 'ProviderUrl'].join('')]: 'https://legacy-idp.example.com',
  }, {
    CSS_PORT: '5738',
  })

  assert.equal(env[['OIDC', 'ISSUER'].join('_')], undefined)
  assert.equal(env.oidcIssuer, undefined)
  assert.equal(env[`CSS_${['OIDC', 'ISSUER'].join('_')}`], undefined)
  assert.equal(env[`CSS_${['IDP', 'URL'].join('_')}`], undefined)
  assert.equal(env[['identity', 'ProviderUrl'].join('')], undefined)
  assert.equal(env.CSS_BASE_URL, 'http://localhost:5737')
  assert.equal(env.CSS_PORT, '5738')
})

test('service embedded CSS runtime config injects oidcIssuer through CSS package settings', (t) => {
  const { createEmbeddedCssRuntimeConfig } = loadXpodWithStubs(t)
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-css-runtime-'))
  const configPath = path.join(runtimeRoot, 'local.json')
  fs.writeFileSync(configPath, '{"@graph":[]}', 'utf-8')

  const runtimeConfig = createEmbeddedCssRuntimeConfig({
    configPath,
    runtimeRoot,
    oidcIssuer: 'https://id.undefineds.co/',
  })

  assert.deepEqual(runtimeConfig, {
    configPath: path.join(runtimeRoot, 'css-runtime.config.json'),
    cwd: runtimeRoot,
  })
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(runtimeRoot, '.community-solid-server.config.json'), 'utf-8')), {
    oidcIssuer: 'https://id.undefineds.co/',
  })
  assert.deepEqual(JSON.parse(fs.readFileSync(runtimeConfig.configPath, 'utf-8')).import, ['./local.json'])
})

test('service xpod token endpoint follows external oidcIssuer for Cloud+Local', (t) => {
  const { oidcTokenEndpoint } = loadXpodWithStubs(t)

  assert.equal(
    oidcTokenEndpoint('https://id.undefineds.co/'),
    'https://id.undefineds.co/.oidc/token',
  )
})

test('service xpod rejects Cloud+Local runtimes without scoped WebID selection', (t) => {
  const { assertXpodLoginRuntimeCapabilities } = loadXpodWithStubs(t)
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-xpod-runtime-capability-'))

  assert.throws(
    () => assertXpodLoginRuntimeCapabilities(runtimeRoot),
    /does not include scoped WebID selection/,
  )

  const handlerPath = path.join(runtimeRoot, 'dist', 'identity', 'oidc')
  fs.mkdirSync(handlerPath, { recursive: true })
  fs.writeFileSync(path.join(handlerPath, 'ScopedPickWebIdHandler.js'), '', 'utf-8')
  fs.mkdirSync(path.join(runtimeRoot, 'config'), { recursive: true })
  fs.writeFileSync(path.join(runtimeRoot, 'config', 'xpod.base.json'), '{}', 'utf-8')

  assert.doesNotThrow(() => assertXpodLoginRuntimeCapabilities(runtimeRoot))
})

test('service embedded CSS args do not pass oidcIssuer as unsupported CSS CLI arg', (t) => {
  const { buildEmbeddedCssArgs } = loadXpodWithStubs(t)

  const args = buildEmbeddedCssArgs({
    cssBinary: '/bin/css',
    configPath: '/xpod/config/local.json',
    cssModuleRoot: '/node_modules/@solid/community-server',
    cssPort: 5738,
    hostBaseUrl: 'http://127.0.0.1:5737/',
  })

  assert.equal(args.includes(`--${['oidc', 'Issuer'].join('')}`), false)
  assert.equal(args.includes(`--${['identity', 'ProviderUrl'].join('')}`), false)
})

test('service xpod bind host follows BASE_URL instead of a separate user-facing listen field', (t) => {
  const { getBindHost } = loadXpodWithStubs(t)

  assert.equal(getBindHost('http://localhost:5737/'), '127.0.0.1')
  assert.equal(getBindHost('http://127.0.0.1:5737/'), '127.0.0.1')
  assert.equal(getBindHost('http://192.168.1.10:5737/'), '0.0.0.0')
})

test('service xpod readiness requires both CSS and API to be running', (t) => {
  const { isXpodStatusReady } = loadXpodWithStubs(t)

  assert.equal(isXpodStatusReady([
    { name: 'css', status: 'running' },
    { name: 'api', status: 'running' },
  ]), true)

  assert.equal(isXpodStatusReady([
    { name: 'css', status: 'running' },
    { name: 'api', status: 'stopped' },
  ]), false)

  assert.equal(isXpodStatusReady([
    { name: 'css', status: 'running' },
  ]), false)
})
