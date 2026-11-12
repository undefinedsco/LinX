import { expect, test, type Frame, type Page } from '@playwright/test'
import { fillCustomLoginProvider, getLoginDialog, selectLoginSpace } from '../helpers/login-ui'
import { isAccountOidcConsentUrl } from '../helpers/oidc-consent-guard'
import { authorizeSeededRuntime, signInToSeededRuntime, waitForSolidDbReady, type ProviderAccount } from '../helpers/seeded-auth-flow'
import { expectSecretaryVisible } from '../helpers/secretary-bootstrap'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'

/**
 * Signed-in acceptance for a LinX Web deployment: sign in, read/write the Pod, and chat.
 *
 * RC (candidate.yml) — a dedicated acceptance account on the real provider:
 *   LINX_E2E_BASE_URL            the deployed site
 *   LINX_E2E_CLOUD_IDENTITY_URL  the provider (signs in through the 云端空间 button)
 *   LINX_E2E_ACCOUNT_EMAIL / LINX_E2E_ACCOUNT_PASSWORD   the acceptance account
 *   LINX_E2E_EXPECT_MODEL_REPLY=1  require a real model answer
 *   LINX_E2E_EXPECT_SINGLE_OIDC_CONSENT=1  fresh single-identity seed sign-in:
 *     the visible user-facing OIDC approval must happen exactly once (RC)
 *   LINX_E2E_EXPECT_BUILTIN_MODELS=1  require /v1/models on the identity host,
 *     and additionally on RC_PROVIDER_API_URL's origin when that env is set
 *     (RC's API origin differs from its identity origin, as in production)
 *
 * Standalone — the same account variables plus LINX_E2E_LOGIN_VIA=custom: signs in to a
 *   standalone xpod (its own identity provider) through 使用其他空间.
 *
 * Local — LINX_E2E_SIGNED_IN_SEEDED=1 starts a seeded xpod and signs in through 使用其他空间
 * (no model is configured there, so the chat check stops at the sent message).
 *
 * Everything written lives under one run folder in the Pod and is deleted at the end.
 */
const runId = `linx-acceptance-${Date.now().toString(36)}`
const expectModelReply = process.env.LINX_E2E_EXPECT_MODEL_REPLY === '1'
const expectBuiltinModels = process.env.LINX_E2E_EXPECT_BUILTIN_MODELS === '1'
const requestFailures = new WeakMap<Page, string[]>()

let runtime: SeededXpodRuntime | null = null
let account: ProviderAccount | null = null
let loginVia: 'cloud' | 'custom' = 'cloud'

// Login and authenticated requests carry credentials; do not retain browser traces.
test.use({ trace: 'off', screenshot: 'off', video: 'off' })
test.describe.configure({ mode: 'serial' })
test.setTimeout(240_000)

test.beforeAll(async () => {
  const email = process.env.LINX_E2E_ACCOUNT_EMAIL?.trim()
  const password = process.env.LINX_E2E_ACCOUNT_PASSWORD
  const identity = process.env.LINX_E2E_CLOUD_IDENTITY_URL?.trim()
  if (email && password && identity) {
    account = { email, password, podName: process.env.LINX_E2E_ACCOUNT_POD?.trim() || 'acceptance', baseUrl: identity.replace(/\/?$/, '/') }
    loginVia = process.env.LINX_E2E_LOGIN_VIA === 'custom' ? 'custom' : 'cloud'
    return
  }
  if (process.env.LINX_E2E_SIGNED_IN_SEEDED === '1') {
    runtime = await startSeededXpodRuntime()
    account = runtime
    loginVia = 'custom'
    return
  }
  test.skip(true, 'signed-in acceptance: set the acceptance account (LINX_E2E_ACCOUNT_*) or LINX_E2E_SIGNED_IN_SEEDED=1')
})

test.afterAll(async () => {
  await runtime?.stop?.()
})

// Capture failures from the first navigation, including a transient bootstrap
// toast that may disappear before the final assertions. Keep only pathname and
// status; queries, headers and response bodies can contain private information.
test.beforeEach(async ({ page }) => {
  const failures: string[] = []
  requestFailures.set(page, failures)
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (response.status() === 400 && /\/sparql\/?$/u.test(url.pathname)) {
      failures.push(`HTTP 400 ${url.pathname}`)
    }
    if (expectBuiltinModels && url.pathname === '/v1/models' && response.status() !== 200) {
      failures.push(`HTTP ${response.status()} /v1/models from ${url.origin}`)
    }
  })
  await page.addInitScript(() => {
    const state = { failed: false }
    ;(window as any).__LINX_ACCEPTANCE_BOOTSTRAP__ = state
    const check = () => {
      if (document.body?.innerText.includes('LinX 助手没能准备好')) state.failed = true
    }
    const observer = new MutationObserver(check)
    observer.observe(document, { childList: true, subtree: true, characterData: true })
    check()
  })
})

test.afterEach(async ({ page }) => {
  expect(requestFailures.get(page) ?? [], 'SPARQL must avoid HTTP 400 and deployment model listing must return HTTP 200').toEqual([])
  if (!page.isClosed()) {
    expect(await page.evaluate(() => (window as any).__LINX_ACCEPTANCE_BOOTSTRAP__?.failed ?? false),
      'the assistant must never report bootstrap failure').toBe(false)
    await expect(page.getByText('LinX 助手没能准备好')).toHaveCount(0)
  }
})

/**
 * Deployment model listing targets. The signed-in identity host is always
 * checked (the existing behavior). RC also declares its API origin, which is a
 * different host from the identity provider — as it is in production
 * (id.undefineds.co vs api.undefineds.co) — so the same session must list
 * models there too. Deduplicate by origin so an identity-only deployment still
 * performs exactly one request.
 */
function deploymentModelTargets(): URL[] {
  const targets = [new URL('/v1/models', account!.baseUrl)]
  const apiUrl = process.env.RC_PROVIDER_API_URL?.trim()
  if (apiUrl) {
    let alias: URL
    try {
      alias = new URL(apiUrl)
    } catch {
      throw new Error('RC_PROVIDER_API_URL must be an absolute http(s) URL')
    }
    if (alias.protocol !== 'http:' && alias.protocol !== 'https:') {
      throw new Error('RC_PROVIDER_API_URL must be an absolute http(s) URL')
    }
    targets.push(new URL('/v1/models', alias))
  }
  const seen = new Set<string>()
  return targets.filter((target) => {
    if (seen.has(target.origin)) return false
    seen.add(target.origin)
    return true
  })
}

async function expectDeploymentModels(page: Page) {
  if (!expectBuiltinModels) return
  const results = await page.evaluate(async (urls) => {
    const db = (window as any).__SOLID_DB__
    // One DPoP session for every origin: never downgrade to a static token.
    const authFetch = db.getDialect().getAuthenticatedFetch()
    const checks = []
    for (const url of urls) {
      // A network/CORS failure is reported as status 0 so the assertion below
      // still names the host instead of failing anonymously.
      const response = await authFetch(url, { cache: 'no-store' }).catch(() => null)
      // Return only public model identifiers, never auth headers or raw bodies.
      const payload = response ? await response.json().catch(() => null) : null
      checks.push({
        origin: new URL(url).origin,
        status: response?.status ?? 0,
        ids: Array.isArray(payload?.data)
          ? payload.data.flatMap((model: any) => typeof model?.id === 'string' ? [model.id] : [])
          : [],
      })
    }
    return checks
  }, deploymentModelTargets().map((target) => target.href))
  for (const result of results) {
    expect(result.status, `DPoP session must list deployment models from ${result.origin} without a Pod interface key`).toBe(200)
    expect(result.ids, `deployment model listing from ${result.origin} must include linx and linx-lite`)
      .toEqual(expect.arrayContaining(['linx', 'linx-lite']))
  }
}

/**
 * Count ENTRIES into the provider's user-facing OIDC consent screen for the
 * whole test, not just the sign-in helper's window.
 *
 * A re-login driven by a mid-chat 401 crosses the same Account consent route;
 * that second consent is exactly the production regression this acceptance must
 * catch. Only main-frame navigations can be the consent page a user acts on
 * (the app's own SPA route changes never match the Account consent path), and a
 * consent screen is counted once per entry so a duplicate event for the same
 * page cannot look like a second approval.
 */
function watchConsentNavigations(page: Page): { count: () => number; stop: () => void } {
  const providerOrigin = account!.baseUrl
  let count = 0
  let lastConsentPath: string | null = null
  const onNavigate = (frame: Frame) => {
    if (frame !== page.mainFrame()) return
    const url = frame.url()
    if (!isAccountOidcConsentUrl(url, providerOrigin)) {
      // Leaving the consent route ends the current entry, so returning to the
      // same consent later still counts as a new one.
      lastConsentPath = null
      return
    }
    // Key on the consent PATH: re-rendering the same screen is not a second
    // approval, while a new `interaction/<id>` screen (or a return after
    // leaving) is. A trailing-slash redirect is the same screen, so normalize it.
    const consentPath = new URL(url).pathname.replace(/\/+$/u, '')
    if (consentPath === lastConsentPath) return
    count += 1
    lastConsentPath = consentPath
  }
  page.on('framenavigated', onNavigate)
  return {
    count: () => count,
    stop: () => page.off('framenavigated', onNavigate),
  }
}

async function signIn(page: Page) {
  await page.goto('/')
  if (loginVia === 'cloud') {
    await selectLoginSpace(page, 'cloud')
  } else {
    await fillCustomLoginProvider(page, account!.baseUrl)
    await getLoginDialog(page).getByRole('button', { name: '继续' }).click()
  }
  // A fresh single-identity seed has exactly one owned WebID/Pod binding: the
  // in-process local seeded runtime, or RC's per-run Alice opt-in. Built-in
  // model expectations do not prove one identity, so they must not enable this.
  const singleIdentitySeed = loginVia === 'custom'
    && (runtime !== null || process.env.LINX_E2E_EXPECT_SINGLE_OIDC_CONSENT === '1')
  const providerOrigin = new URL(account!.baseUrl).origin
  await page.waitForURL((url) => url.origin === providerOrigin, { timeout: 60_000 })
  await signInToSeededRuntime(page, account!)
  const approvals = await authorizeSeededRuntime(
    page,
    account!,
    singleIdentitySeed ? { maxOidcApprovalScreens: 1 } : {},
  )
  if (singleIdentitySeed) {
    // The xpod pre-binding fix must make the first apparent click the real
    // consent, not a pick-webid POST that produces a second approval screen.
    expect(approvals, 'fresh single-identity seed sign-in must approve OIDC consent exactly once').toBe(1)
  }
  await page.waitForURL((url) => url.origin !== providerOrigin, { timeout: 60_000 })
  await expectSecretaryVisible(page, 90_000)
  await waitForSolidDbReady(page)
  await expectDeploymentModels(page)
}

/** The app's own authenticated fetch against the signed-in Pod. */
async function pod(page: Page, method: 'GET' | 'PUT' | 'DELETE', path: string, body?: string) {
  await waitForSolidDbReady(page)
  return page.evaluate(async ({ method, path, body }) => {
    const w = window as any
    const authFetch = w.__SOLID_DB__.getDialect().getAuthenticatedFetch()
    const base = String(w.__SOLID_DB_POD_URL__).replace(/\/?$/, '/')
    const response = await authFetch(`${base}${path}`, {
      method,
      cache: 'no-store',
      ...(body !== undefined ? { headers: { 'Content-Type': 'text/markdown' }, body } : {}),
    })
    return { status: response.status, text: method === 'GET' ? await response.text() : '' }
  }, { method, path, body })
}

test('signs in, writes and reads the Pod, and cleans up', async ({ page }) => {
  await signIn(page)
  await expect(page.getByText('页面暂时无法打开')).toHaveCount(0)

  const note = `${runId}/note.md`
  const content = `# ${runId}\n\nLinX acceptance note.\n`
  expect([200, 201, 205]).toContain((await pod(page, 'PUT', note, content)).status)
  const read = await pod(page, 'GET', note)
  expect(read.status).toBe(200)
  expect(read.text).toBe(content)

  expect([200, 204, 205]).toContain((await pod(page, 'DELETE', note)).status)
  expect((await pod(page, 'GET', note)).status).toBe(404)
  await pod(page, 'DELETE', `${runId}/`)
})

test('chats with the assistant', async ({ page }) => {
  const consent = watchConsentNavigations(page)
  try {
    await signIn(page)
    // The legal first consent is whatever sign-in needed (exactly one on a fresh
    // seed). From here on, a new consent entry means a mid-chat re-login.
    const consentsAfterSignIn = consent.count()
    await page.evaluate(() => { history.pushState({}, '', '/chat'); dispatchEvent(new PopStateEvent('popstate')) })
    const input = page.getByRole('textbox', { name: '消息' })
    await expect(input).toBeVisible({ timeout: 30_000 })
    const prompt = `${runId} 请只回复：收到`
    await input.fill(prompt)
    await input.press('Enter')
    await expect(page.locator('[data-role="user"]').filter({ hasText: runId })).toBeVisible({ timeout: 30_000 })

    if (!expectModelReply) return
    const answer = page.locator('[data-role="assistant"]').last()
    await expect(answer).not.toContainText('消息生成失败', { timeout: 120_000 })
    await expect.poll(async () => (await answer.innerText()).trim().length, { timeout: 120_000 }).toBeGreaterThan(0)
    await expect(answer).not.toContainText('这次没有完成')
    // The default linx/linx-lite route must be found; a "no model" notice is not a reply.
    await expect(answer).not.toContainText('还没有连接 AI 模型')
    await expect(answer).toContainText('收到', { timeout: 120_000 })
    await expect(answer).not.toContainText(runId)
    // Sending a real message must not force a second OIDC consent. A re-login
    // that returns to the app is still a failure: the user approved once.
    expect(consent.count(), 'chat must reach a real reply without another OIDC consent after sign-in').toBe(consentsAfterSignIn)
  } finally {
    consent.stop()
  }
})
