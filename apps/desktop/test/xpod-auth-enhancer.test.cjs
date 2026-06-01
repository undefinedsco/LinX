const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const {
  normalizeXpodPathname,
  isXpodIndexPageUrl,
  isXpodAccountPageUrl,
  isXpodCreatePodPageUrl,
  isXpodConsentPageUrl,
  isXpodPasswordLoginPageUrl,
  isXpodPasswordRegisterPageUrl,
  isXpodAuthPageUrl,
  addEmbeddedAuthQuery,
  buildXpodAuthEnhancerScript,
  buildXpodAuthEnhancerPreloadScript,
  installXpodAuthEnhancerOnNewDocument,
  installXpodAuthEnhancer,
} = require(resolveCompiledDesktopModule('lib/xpod-auth-enhancer.js'))

test('normalizeXpodPathname keeps trailing slash semantics stable', () => {
  assert.equal(normalizeXpodPathname('/.account/account'), '/.account/account/')
  assert.equal(normalizeXpodPathname('/.account/oidc/consent/'), '/.account/oidc/consent/')
})

test('xpod auth page url matchers detect account SPA routes only', () => {
  assert.equal(isXpodIndexPageUrl('http://localhost:3000/.account/'), true)
  assert.equal(isXpodAccountPageUrl('http://localhost:3000/.account/account/'), true)
  assert.equal(isXpodCreatePodPageUrl('http://localhost:3000/.account/create-pod/'), true)
  assert.equal(isXpodConsentPageUrl('http://localhost:3000/.account/oidc/consent/'), true)
  assert.equal(isXpodPasswordLoginPageUrl('http://localhost:3000/.account/login/password/'), true)
  assert.equal(isXpodPasswordRegisterPageUrl('http://localhost:3000/.account/login/password/register/'), true)
  assert.equal(isXpodAuthPageUrl('http://localhost:3000/.account/'), true)
  assert.equal(isXpodAuthPageUrl('http://localhost:3000/.account/account/'), true)
  assert.equal(isXpodAuthPageUrl('http://localhost:3000/.account/create-pod/'), true)
  assert.equal(isXpodAuthPageUrl('http://localhost:3000/.account/oidc/consent/'), true)
  assert.equal(isXpodAuthPageUrl('http://localhost:3000/.account/login/password/'), true)
  assert.equal(isXpodAuthPageUrl('http://localhost:3000/.account/login/password/register/'), true)
  assert.equal(isXpodAuthPageUrl('http://localhost:3000/.account/login/'), false)
})

test('addEmbeddedAuthQuery forces compact auth mode only on xpod auth pages', () => {
  assert.equal(
    addEmbeddedAuthQuery('http://localhost:3000/.account/oidc/consent/'),
    'http://localhost:3000/.account/oidc/consent/?embedded=1',
  )
  assert.equal(
    addEmbeddedAuthQuery('http://localhost:3000/.account/'),
    'http://localhost:3000/.account/?embedded=1',
  )
  assert.equal(
    addEmbeddedAuthQuery('http://localhost:3000/.account/login/password/?returnTo=%2Ffoo'),
    'http://localhost:3000/.account/login/password/?returnTo=%2Ffoo&embedded=1',
  )
  assert.equal(
    addEmbeddedAuthQuery('http://localhost:3000/.account/create-pod/'),
    'http://localhost:3000/.account/create-pod/?embedded=1',
  )
  assert.equal(
    addEmbeddedAuthQuery('http://localhost:3000/.account/login/'),
    'http://localhost:3000/.account/login/',
  )
})

test('buildXpodAuthEnhancerScript only persists provisionCode and does not patch CSS pages', () => {
  const script = buildXpodAuthEnhancerScript()

  assert.match(script, /sessionStorage\.setItem\("provisionCode", provisionCode\)/)
  assert.match(script, /__LINX_XPOD_AUTH_ENHANCER__/)
  assert.doesNotMatch(script, /window\.fetch\s*=/)
  assert.doesNotMatch(script, /history\.pushState\s*=/)
  assert.doesNotMatch(script, /MutationObserver/)
  assert.doesNotMatch(script, /querySelector/)
  assert.doesNotMatch(script, /provision\/webids/)
  assert.doesNotMatch(script, /provision\/pods/)
})

test('buildXpodAuthEnhancerPreloadScript persists provisionCode before installing enhancer', () => {
  const script = buildXpodAuthEnhancerPreloadScript('pc-preload')

  assert.match(script, /sessionStorage\.setItem\("provisionCode", nextProvisionCode\)/)
  assert.match(script, /pc-preload/)
  assert.match(script, /__LINX_XPOD_AUTH_ENHANCER__/)
})

test('installXpodAuthEnhancerOnNewDocument registers a preload script through devtools protocol', async () => {
  const commands = []
  const target = {
    debugger: {
      isAttached: () => false,
      attach: (version) => {
        commands.push({ command: 'attach', version })
      },
      sendCommand: async (command, params) => {
        commands.push({ command, params })
        if (command === 'Page.addScriptToEvaluateOnNewDocument') {
          return { identifier: 'script-1' }
        }
        return {}
      },
    },
  }

  const installed = await installXpodAuthEnhancerOnNewDocument(target, 'pc-preload')

  assert.equal(installed, true)
  assert.deepEqual(commands[0], { command: 'attach', version: '1.3' })
  assert.equal(commands[1].command, 'Page.enable')
  assert.equal(commands[2].command, 'Page.addScriptToEvaluateOnNewDocument')
  assert.match(commands[2].params.source, /pc-preload/)
  assert.match(commands[2].params.source, /__LINX_XPOD_AUTH_ENHANCER__/)
})

test('installXpodAuthEnhancerOnNewDocument replaces previous preload script', async () => {
  const commands = []
  const target = {
    debugger: {
      isAttached: () => true,
      attach: () => {
        throw new Error('should not attach twice')
      },
      sendCommand: async (command, params) => {
        commands.push({ command, params })
        if (command === 'Page.addScriptToEvaluateOnNewDocument') {
          return { identifier: `script-${commands.length}` }
        }
        return {}
      },
    },
  }

  await installXpodAuthEnhancerOnNewDocument(target, 'pc-1')
  await installXpodAuthEnhancerOnNewDocument(target, 'pc-2')

  assert.equal(commands[2].command, 'Page.enable')
  assert.equal(commands[3].command, 'Page.removeScriptToEvaluateOnNewDocument')
  assert.equal(commands[3].params.identifier, 'script-2')
  assert.equal(commands[4].command, 'Page.addScriptToEvaluateOnNewDocument')
  assert.match(commands[4].params.source, /pc-2/)
})

test('installXpodAuthEnhancer only injects on xpod auth pages', async () => {
  const executed = []
  const installed = await installXpodAuthEnhancer({
    getURL: () => 'http://localhost:3000/.account/oidc/consent/',
    executeJavaScript: async (code, userGesture) => {
      executed.push({ code, userGesture })
    },
  })

  assert.equal(installed, true)
  assert.equal(executed.length, 1)
  assert.match(executed[0].code, /provisionCode/)
  assert.equal(executed[0].userGesture, true)

  const skipped = await installXpodAuthEnhancer({
    getURL: () => 'http://localhost:3000/chat/',
    executeJavaScript: async () => {
      throw new Error('should not inject')
    },
  })
  assert.equal(skipped, false)
})
