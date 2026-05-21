const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const {
  normalizeXpodPathname,
  isXpodAccountPageUrl,
  isXpodConsentPageUrl,
  isXpodPasswordLoginPageUrl,
  isXpodPasswordRegisterPageUrl,
  isXpodAuthPageUrl,
  addEmbeddedAuthQuery,
  buildXpodAuthEnhancerScript,
  installXpodAuthEnhancer,
} = require(resolveCompiledDesktopModule('lib/xpod-auth-enhancer.js'))

test('normalizeXpodPathname keeps trailing slash semantics stable', () => {
  assert.equal(normalizeXpodPathname('/.account/account'), '/.account/account/')
  assert.equal(normalizeXpodPathname('/.account/oidc/consent/'), '/.account/oidc/consent/')
})

test('xpod auth page url matchers detect account, consent, and register pages', () => {
  assert.equal(isXpodAccountPageUrl('http://localhost:3000/.account/account/'), true)
  assert.equal(isXpodConsentPageUrl('http://localhost:3000/.account/oidc/consent/'), true)
  assert.equal(isXpodPasswordLoginPageUrl('http://localhost:3000/.account/login/password/'), true)
  assert.equal(isXpodPasswordRegisterPageUrl('http://localhost:3000/.account/login/password/register/'), true)
  assert.equal(isXpodAuthPageUrl('http://localhost:3000/.account/account/'), true)
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
    addEmbeddedAuthQuery('http://localhost:3000/.account/login/password/?returnTo=%2Ffoo'),
    'http://localhost:3000/.account/login/password/?returnTo=%2Ffoo&embedded=1',
  )
  assert.equal(
    addEmbeddedAuthQuery('http://localhost:3000/.account/login/'),
    'http://localhost:3000/.account/login/',
  )
})

test('buildXpodAuthEnhancerScript includes pending pod and username coordination hooks', () => {
  const script = buildXpodAuthEnhancerScript()

  assert.match(script, /pending-pod-creation/)
  assert.match(script, /pending-username/)
  assert.match(script, /submitted-username/)
  assert.match(script, /confirmPassword/)
  assert.match(script, /login\/password/)
  assert.match(script, /input\[name="username"\]/)
  assert.match(script, /Add Pod/)
  assert.match(script, /Delaying consent navigation until WebID is ready/)
  assert.match(script, /Preparing Pod…/)
  assert.match(script, /oidc\/pick-webid/)
  assert.match(script, /PopStateEvent/)
  assert.match(script, /inline-alert/)
  assert.match(script, /这个 Pod 地址已存在，请换一个用户名或 Pod 名称。/)
  assert.match(script, /这个邮箱已经注册，请直接登录或换一个邮箱。/)
  assert.match(script, /正在检查可用性/)
  assert.match(script, /Pod 地址可用/)
  assert.match(script, /linxValidatedUsername/)
  assert.match(script, /handleAuthFormError/)
  assert.match(script, /characterData: true/)
  assert.match(script, /nativeFetch/)
  assert.match(script, /attachProvisionCodeToPodCreate/)
  assert.match(script, /sessionStorage\.getItem\("provisionCode"\)/)
  assert.doesNotMatch(script, /window\.location\.assign/)
})

test('buildXpodAuthEnhancerScript waits for account page before pending pod creation', () => {
  const script = buildXpodAuthEnhancerScript()

  assert.match(script, /sessionStorage\.setItem\(SUBMITTED_USERNAME_KEY, username\)/)
  assert.match(script, /currentPathname\(\) === ACCOUNT_PATH/)
  assert.match(script, /setPendingUsername\(submittedUsername\)/)
  assert.doesNotMatch(script, /setPendingUsername\(username\);\s*return;/)
})

test('buildXpodAuthEnhancerScript clears submitted username when register page shows an error', () => {
  const script = buildXpodAuthEnhancerScript()

  assert.match(script, /handleAuthFormError\(target\.textContent\)/)
  assert.match(script, /window\.sessionStorage\.removeItem\(SUBMITTED_USERNAME_KEY\)/)
  assert.match(script, /clearPendingUsername\(\)/)
})

test('buildXpodAuthEnhancerScript injects provisionCode into pod create requests', async () => {
  const script = buildXpodAuthEnhancerScript()
  const calls = []
  const context = {
    globalThis: {},
    window: {
      location: {
        pathname: '/.account/account/',
        href: 'https://id.undefineds.co/.account/account/',
        origin: 'https://id.undefineds.co',
      },
      sessionStorage: {
        getItem: (key) => key === 'provisionCode' ? 'pc-123' : null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      history: {
        pushState: () => undefined,
        replaceState: () => undefined,
      },
      fetch: async (resource, init) => {
        calls.push({ resource, init })
        return { ok: true }
      },
      setTimeout,
      clearTimeout,
      addEventListener: () => undefined,
      dispatchEvent: () => undefined,
      locationAssign: () => undefined,
    },
    document: {
      addEventListener: () => undefined,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        style: {},
        dataset: {},
        classList: { add: () => undefined, remove: () => undefined },
        append: () => undefined,
        appendChild: () => undefined,
        setAttribute: () => undefined,
      }),
      documentElement: {},
      body: {
        appendChild: () => undefined,
      },
    },
    MutationObserver: class {
      observe() {}
    },
    URL,
    Request: class {},
    FormData: class {},
    HTMLFormElement: class {},
    HTMLButtonElement: class {},
    HTMLInputElement: class {},
    HTMLAnchorElement: class {},
    PopStateEvent: class {},
    setTimeout,
    clearTimeout,
  }
  context.globalThis = context
  context.window.fetch = context.window.fetch.bind(context.window)

  const vm = require('node:vm')
  vm.runInNewContext(script, context)

  await context.window.fetch('/.account/api/pod', {
    method: 'POST',
    body: JSON.stringify({ name: 'alice' }),
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    name: 'alice',
    settings: { provisionCode: 'pc-123' },
  })
})

test('installXpodAuthEnhancer skips non xpod auth pages', async () => {
  let executed = false
  const installed = await installXpodAuthEnhancer({
    getURL: () => 'http://localhost:3000/.account/login/',
    executeJavaScript: async () => {
      executed = true
    },
  })

  assert.equal(installed, false)
  assert.equal(executed, false)
})

test('installXpodAuthEnhancer injects script on xpod auth pages', async () => {
  let executedScript = null
  const installed = await installXpodAuthEnhancer({
    getURL: () => 'http://localhost:3000/.account/oidc/consent/',
    executeJavaScript: async (script) => {
      executedScript = script
      return 'installed'
    },
  })

  assert.equal(installed, true)
  assert.match(executedScript, /__LINX_XPOD_AUTH_ENHANCER__/)
})
