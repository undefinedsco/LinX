const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
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

test('xpod auth page url matchers detect index, account, create-pod, consent, and register pages', () => {
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
  assert.match(script, /lookupScopedWebIdEntries/)
  assert.match(script, /provision\/webids/)
  assert.match(script, /ensureLocalFirstPodPrompt/)
  assert.match(script, /local-first-pod/)
  assert.match(script, /provision\/pods/)
  assert.match(script, /deriveUsernameFromWebId/)
  assert.match(script, /scopeAccountResourceResponse/)
  assert.match(script, /sessionStorage\.getItem\("provisionCode"\)/)
  assert.doesNotMatch(script, /window\.location\.assign/)
})

test('buildXpodAuthEnhancerScript waits for account page before pending pod creation', () => {
  const script = buildXpodAuthEnhancerScript()

  assert.match(script, /sessionStorage\.setItem\(SUBMITTED_USERNAME_KEY, username\)/)
  assert.match(script, /isAccountDashboardPath\(\)/)
  assert.match(script, /setPendingUsername\(submittedUsername\)/)
  assert.doesNotMatch(script, /setPendingUsername\(username\);\s*return;/)
})

test('buildXpodAuthEnhancerScript clears submitted username when register page shows an error', () => {
  const script = buildXpodAuthEnhancerScript()

  assert.match(script, /handleAuthFormError\(target\.textContent\)/)
  assert.match(script, /window\.sessionStorage\.removeItem\(SUBMITTED_USERNAME_KEY\)/)
  assert.match(script, /clearPendingUsername\(\)/)
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
    HTMLElement: class {},
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

test('buildXpodAuthEnhancerScript scopes Cloud WebID picker results to Local SP', async () => {
  const script = buildXpodAuthEnhancerScript()
  const provisionPayload = Buffer.from(JSON.stringify({
    spUrl: 'https://node-0000.undefineds.co/',
    serviceToken: 'service-token',
  })).toString('base64url')
  const provisionCode = `${provisionPayload}.signature`
  const calls = []
  const context = createScriptContext({
    pathname: '/.account/oidc/pick-webid/',
    provisionCode,
    fetch: async (resource, init) => {
      calls.push({ resource: String(resource), init })
      if (String(resource) === 'https://node-0000.undefineds.co/provision/webids') {
        return jsonResponse({
          entries: [
            {
              webId: 'https://id.undefineds.co/alice/profile/card#me',
              storageUrl: 'https://node-0000.undefineds.co/alice/',
            },
          ],
        })
      }
      return jsonResponse({
        webIds: [
          'https://id.undefineds.co/alice/profile/card#me',
          'https://id.undefineds.co/bob/profile/card#me',
        ],
        entries: [
          {
            webId: 'https://id.undefineds.co/alice/profile/card#me',
            storageUrl: 'https://id.undefineds.co/alice/',
          },
          {
            webId: 'https://id.undefineds.co/bob/profile/card#me',
            storageUrl: 'https://id.undefineds.co/bob/',
          },
        ],
      })
    },
  })

  const vm = require('node:vm')
  vm.runInNewContext(script, context)

  const response = await context.window.fetch('/.account/oidc/pick-webid/', {
    headers: { Accept: 'application/json' },
  })
  const body = await response.json()

  assert.deepEqual(body.webIds, ['https://id.undefineds.co/alice/profile/card#me'])
  assert.deepEqual(body.entries, [
    {
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      storageUrl: 'https://node-0000.undefineds.co/alice/',
    },
  ])
  assert.equal(calls[1].resource, 'https://node-0000.undefineds.co/provision/webids')
  assert.equal(calls[1].init.headers.Authorization, 'Bearer service-token')
})

test('buildXpodAuthEnhancerScript blocks unscoped Cloud WebID picker submissions', async () => {
  const script = buildXpodAuthEnhancerScript()
  const provisionPayload = Buffer.from(JSON.stringify({
    spUrl: 'https://node-0000.undefineds.co/',
    serviceToken: 'service-token',
  })).toString('base64url')
  const context = createScriptContext({
    pathname: '/.account/oidc/pick-webid/',
    provisionCode: `${provisionPayload}.signature`,
    fetch: async (resource, init) => {
      if (String(resource) === 'https://node-0000.undefineds.co/provision/webids') {
        return jsonResponse({ entries: [] })
      }
      return jsonResponse({ accepted: true })
    },
  })

  const vm = require('node:vm')
  vm.runInNewContext(script, context)

  const response = await context.window.fetch('/.account/oidc/pick-webid/', {
    method: 'POST',
    body: JSON.stringify({ webId: 'https://id.undefineds.co/bob/profile/card#me', remember: false }),
  })

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    error: 'WebID does not belong to this storage provider.',
  })
})

test('buildXpodAuthEnhancerScript scopes Cloud account WebID resources to Local SP', async () => {
  const script = buildXpodAuthEnhancerScript()
  const provisionPayload = Buffer.from(JSON.stringify({
    spUrl: 'http://127.0.0.1:5737/',
    spDomain: 'node-0000.undefineds.co',
    serviceToken: 'service-token',
  })).toString('base64url')
  const calls = []
  const context = createScriptContext({
    pathname: '/.account/account/',
    provisionCode: `${provisionPayload}.signature`,
    fetch: async (resource, init) => {
      calls.push({ resource: String(resource), init })
      if (String(resource) === 'http://127.0.0.1:5737/provision/webids') {
        return jsonResponse({
          entries: [
            {
              webId: 'https://id.undefineds.co/alice/profile/card#me',
              podUrl: 'https://node-0000.undefineds.co/alice/',
              storageUrl: 'https://node-0000.undefineds.co/alice/',
            },
          ],
        })
      }
      return jsonResponse({
        webIdLinks: {
          'https://id.undefineds.co/alice/profile/card#me': '/.account/account/link-local',
          'https://id.undefineds.co/bob/profile/card#me': '/.account/account/link-cloud',
        },
      })
    },
  })

  const vm = require('node:vm')
  vm.runInNewContext(script, context)

  const response = await context.window.fetch('/.account/account/account-1/webid/', {
    headers: { Accept: 'application/json' },
  })
  const body = await response.json()

  assert.deepEqual(body.webIdLinks, {
    'https://id.undefineds.co/alice/profile/card#me': '/.account/account/link-local',
  })
  assert.equal(calls[1].resource, 'http://127.0.0.1:5737/provision/webids')
})

test('buildXpodAuthEnhancerScript replaces Cloud account Pods with scoped Local Pods', async () => {
  const script = buildXpodAuthEnhancerScript()
  const provisionPayload = Buffer.from(JSON.stringify({
    spUrl: 'http://127.0.0.1:5737/',
    spDomain: 'node-0000.undefineds.co',
    serviceToken: 'service-token',
  })).toString('base64url')
  const context = createScriptContext({
    pathname: '/.account/account/',
    provisionCode: `${provisionPayload}.signature`,
    fetch: async (resource) => {
      if (String(resource) === 'http://127.0.0.1:5737/provision/webids') {
        return jsonResponse({
          entries: [
            {
              webId: 'https://id.undefineds.co/alice/profile/card#me',
              podUrl: 'https://node-0000.undefineds.co/alice/',
              storageUrl: 'https://node-0000.undefineds.co/alice/',
            },
          ],
        })
      }
      if (String(resource).includes('/webid/')) {
        return jsonResponse({
          webIdLinks: {
            'https://id.undefineds.co/alice/profile/card#me': '/.account/account/link-local',
            'https://id.undefineds.co/bob/profile/card#me': '/.account/account/link-cloud',
          },
        })
      }
      return jsonResponse({
        pods: {
          'https://id.undefineds.co/alice/': '/.account/account/cloud-pod',
          'https://node-0000.undefineds.co/charlie/': '/.account/account/other-local-pod',
        },
      })
    },
  })

  const vm = require('node:vm')
  vm.runInNewContext(script, context)

  await context.window.fetch('/.account/account/account-1/webid/', {
    headers: { Accept: 'application/json' },
  })
  const response = await context.window.fetch('/.account/account/account-1/pod/', {
    headers: { Accept: 'application/json' },
  })
  const body = await response.json()

  assert.deepEqual(body.pods, {
    'https://node-0000.undefineds.co/charlie/': '/.account/account/other-local-pod',
  })
})

test('buildXpodAuthEnhancerScript derives Local Pods when Cloud account Pod list has no Local entries', async () => {
  const script = buildXpodAuthEnhancerScript()
  const provisionPayload = Buffer.from(JSON.stringify({
    spUrl: 'http://127.0.0.1:5737/',
    spDomain: 'node-0000.undefineds.co',
    serviceToken: 'service-token',
  })).toString('base64url')
  const context = createScriptContext({
    pathname: '/.account/account/',
    provisionCode: `${provisionPayload}.signature`,
    fetch: async (resource) => {
      if (String(resource) === 'http://127.0.0.1:5737/provision/webids') {
        return jsonResponse({
          entries: [
            {
              webId: 'https://id.undefineds.co/alice/profile/card#me',
              podUrl: 'https://node-0000.undefineds.co/alice/',
              storageUrl: 'https://node-0000.undefineds.co/alice/',
            },
          ],
        })
      }
      if (String(resource).includes('/webid/')) {
        return jsonResponse({
          webIdLinks: {
            'https://id.undefineds.co/alice/profile/card#me': '/.account/account/link-local',
            'https://id.undefineds.co/bob/profile/card#me': '/.account/account/link-cloud',
          },
        })
      }
      return jsonResponse({
        pods: {
          'https://id.undefineds.co/alice/': '/.account/account/cloud-pod',
        },
      })
    },
  })

  const vm = require('node:vm')
  vm.runInNewContext(script, context)

  await context.window.fetch('/.account/account/account-1/webid/', {
    headers: { Accept: 'application/json' },
  })
  const response = await context.window.fetch('/.account/account/account-1/pod/', {
    headers: { Accept: 'application/json' },
  })
  const body = await response.json()

  assert.deepEqual(body.pods, {
    'https://node-0000.undefineds.co/alice/': '',
  })
})

test('buildXpodAuthEnhancerScript injects first Local Pod creation prompt for old Cloud account UI', async () => {
  const script = buildXpodAuthEnhancerScript()
  const provisionPayload = Buffer.from(JSON.stringify({
    spUrl: 'http://127.0.0.1:5737/',
    spDomain: 'node-0000.undefineds.co',
    serviceToken: 'service-token',
  })).toString('base64url')
  const provisionCode = `${provisionPayload}.signature`
  const calls = []
  let createBody = null
  let navigatedTo = null
  const dom = new JSDOM(`
    <main>
      <div>
        <p>No Pods found. Create one to get started.</p>
      </div>
    </main>
  `, {
    url: 'https://id.undefineds.co/.account/account/',
    runScripts: 'outside-only',
  })
  const { window } = dom
  window.Response = Response
  window.Request = Request
  window.fetch = async (resource, init) => {
    calls.push({ resource: String(resource), init })
    if (String(resource) === 'http://127.0.0.1:5737/provision/webids') {
      return jsonResponse({ entries: [] })
    }
    if (String(resource) === 'http://127.0.0.1:5737/provision/pods/alice') {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (String(resource) === '/.account/account/account-1/pod/') {
      createBody = JSON.parse(init.body)
      return jsonResponse({ ok: true })
    }
    return jsonResponse({
      controls: {
        account: {
          pod: '/.account/account/account-1/pod/',
        },
      },
      webIdLinks: {
        'https://id.undefineds.co/alice/profile/card#me': '/.account/account/link-cloud',
      },
    })
  }
  const originalPushState = window.history.pushState.bind(window.history)
  window.history.pushState = (_state, _title, url) => {
    navigatedTo = String(url)
    originalPushState(_state, _title, url)
  }
  window.sessionStorage.setItem('provisionCode', provisionCode)

  window.eval(script)
  await window.fetch('/.account/account/account-1/webid/', {
    headers: { Accept: 'application/json' },
  })
  window.document.body.appendChild(window.document.createElement('span'))
  await nextTick()

  const prompt = window.document.querySelector('[data-linx-role="local-first-pod-prompt"]')
  assert.ok(prompt)
  const input = prompt.querySelector('input[name="username"]')
  assert.ok(input)
  input.value = 'alice'
  assert.equal(input.value, 'alice')

  prompt.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await waitFor(() => createBody !== null)

  assert.deepEqual(createBody, {
    name: 'alice',
    settings: { provisionCode },
  })
  await waitFor(() => navigatedTo === '/.account/oidc/consent/')
  assert.equal(navigatedTo, '/.account/oidc/consent/')
})

test('buildXpodAuthEnhancerScript filters account client credentials by scoped WebIDs', async () => {
  const script = buildXpodAuthEnhancerScript()
  const provisionPayload = Buffer.from(JSON.stringify({
    spUrl: 'http://127.0.0.1:5737/',
    spDomain: 'node-0000.undefineds.co',
    serviceToken: 'service-token',
  })).toString('base64url')
  const context = createScriptContext({
    pathname: '/.account/account/',
    provisionCode: `${provisionPayload}.signature`,
    fetch: async (resource) => {
      if (String(resource) === 'http://127.0.0.1:5737/provision/webids') {
        return jsonResponse({
          entries: [
            {
              webId: 'https://id.undefineds.co/alice/profile/card#me',
              podUrl: 'https://node-0000.undefineds.co/alice/',
              storageUrl: 'https://node-0000.undefineds.co/alice/',
            },
          ],
        })
      }
      if (String(resource).endsWith('/cred-local')) {
        return jsonResponse({ webId: 'https://id.undefineds.co/alice/profile/card#me' })
      }
      if (String(resource).endsWith('/cred-cloud')) {
        return jsonResponse({ webId: 'https://id.undefineds.co/bob/profile/card#me' })
      }
      if (String(resource).includes('/webid/')) {
        return jsonResponse({
          webIdLinks: {
            'https://id.undefineds.co/alice/profile/card#me': '/.account/account/link-local',
            'https://id.undefineds.co/bob/profile/card#me': '/.account/account/link-cloud',
          },
        })
      }
      return jsonResponse({
        clientCredentials: {
          local: 'https://id.undefineds.co/.account/account/cred-local',
          cloud: 'https://id.undefineds.co/.account/account/cred-cloud',
        },
      })
    },
  })

  const vm = require('node:vm')
  vm.runInNewContext(script, context)

  await context.window.fetch('/.account/account/account-1/webid/', {
    headers: { Accept: 'application/json' },
  })
  const response = await context.window.fetch('/.account/account/account-1/client-credentials/', {
    headers: { Accept: 'application/json' },
  })
  const body = await response.json()

  assert.deepEqual(body.clientCredentials, {
    local: 'https://id.undefineds.co/.account/account/cred-local',
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

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for condition')
}

function createScriptContext({ pathname, provisionCode, fetch }) {
  const context = {
    globalThis: {},
    window: {
      location: {
        pathname,
        href: `https://id.undefineds.co${pathname}`,
        origin: 'https://id.undefineds.co',
      },
      atob: (value) => Buffer.from(value, 'base64').toString('binary'),
      sessionStorage: {
        getItem: (key) => key === 'provisionCode' ? provisionCode : null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      history: {
        pushState: () => undefined,
        replaceState: () => undefined,
      },
      fetch,
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
    Response,
    FormData: class {},
    HTMLFormElement: class {},
    HTMLButtonElement: class {},
    HTMLInputElement: class {},
    HTMLElement: class {},
    HTMLAnchorElement: class {},
    PopStateEvent: class {},
    setTimeout,
    clearTimeout,
  }
  context.globalThis = context
  context.window.fetch = context.window.fetch.bind(context.window)
  return context
}
