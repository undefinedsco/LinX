import { expect, test, type Page } from '@playwright/test'
import { resolveSavedPublicLocalOrigin, startRealLocalCloudRuntime } from '../helpers/real-local-cloud-runtime.cjs'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

test.describe.configure({ mode: 'serial' })

const savedPublicLocalOrigin = resolveSavedPublicLocalOrigin()

test.describe('Real Local -> Cloud auth flow', () => {
  test.skip(
    !savedPublicLocalOrigin,
    'Real Local -> Cloud auth requires saved desktop Local Cloud registration so production Cloud can reach the Local SP.',
  )

  test('starts Cloud-managed Local, signs up through production Cloud, and lands on chat', async ({ page }) => {
    test.setTimeout(240_000)

    const runtime = await startRealLocalCloudRuntime(page)
    const podCreateRequests: Array<{
      target: string
      hasName: boolean
      hasProvisionCode: boolean
    }> = []

    page.on('console', (message) => {
      console.log(`[browser:${message.type()}] ${message.text()}`)
    })
    page.on('pageerror', (error) => {
      console.error(`[pageerror] ${error.message}`)
    })
    page.on('requestfailed', (request) => {
      console.error(`[requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`)
    })
    page.on('request', (request) => {
      const method = request.method().toUpperCase()
      if (method !== 'POST') {
        return
      }
      const body = request.postData() ?? ''
      if (!body.includes('"name"')) {
        return
      }
      let parsed: any = null
      try {
        parsed = JSON.parse(body)
      } catch {
        // ignore non-JSON requests
      }
      if (!parsed?.name) {
        return
      }
      const entry = {
        target: request.url(),
        hasName: true,
        hasProvisionCode: Boolean(parsed?.settings?.provisionCode),
      }
      podCreateRequests.push(entry)
      console.log(`[real-local-cloud] pod-create target=${entry.target} hasProvisionCode=${entry.hasProvisionCode}`)
    })
    page.on('response', (response) => {
      if (response.status() >= 400) {
        console.error(`[response:${response.status()}] ${response.url()}`)
        if (response.url().includes('/.account/') || response.url().includes('/provision/')) {
          void response.text().then(
            (body) => console.error(`[response-body:${response.status()}] ${response.url()} ${body.slice(0, 1000)}`),
            (error) => console.error(`[response-body-error] ${response.url()} ${String(error)}`),
          )
        }
      }
    })

    try {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: '选择空间' })).toBeVisible({ timeout: 15_000 })

      await clickLocalSpaceEntry(page)
      await waitForLocalReady(page, runtime, 180_000)
      await runtime.ensureBrowserRoute()
      await continueToLocalAccountSurface(page)

      const registerResult = await registerOnProductionCloud(page, runtime)
      const consentResult = await provisionAndAuthorize(page, runtime)
      expect(
        podCreateRequests.some((request) => request.hasProvisionCode),
        `Cloud pod create request must include provisionCode\n${JSON.stringify(podCreateRequests, null, 2)}`,
      ).toBe(true)

      const landedOnChat = await waitForChatPath(page, 60_000)
      if (!landedOnChat) {
        throw new Error(`expected LinX to land on /chat\n${JSON.stringify(await collectDebugState(page, runtime), null, 2)}`)
      }
      await waitForSolidDbReady(page, 90_000)
      await expectSecretaryInitialized(page)

      const debug = await collectDebugState(page, runtime)
      expect(debug.snapshot.state).toBe('ready')
      expect(debug.snapshot.cloudIdentityUrl).toBe('https://id.undefineds.co')
      expect(debug.url).toContain('/chat')
      expect(debug.dbReady).toBe(true)
      expect(debug.dbStatus).toBe('ready')
      expect(debug.dbError).toBeNull()
      expect(debug.storedAccount?.webId).toBeTruthy()
      expect(debug.storedAccount?.webId).toMatch(/^https:\/\/id\.undefineds\.co\//)
      expect(debug.storedAccount?.storageProviderLabel).toBe('Local')
      expect(normalizeUrl(debug.storedAccount?.issuerUrl)).toBe('https://id.undefineds.co/')
      expect(normalizeUrl(debug.storedAccount?.storageProviderUrl)).toBe(normalizeUrl(debug.snapshot.publicUrl))
      expect(debug.dbPodUrl).toMatch(new RegExp(`^${escapeRegExp(normalizeUrl(debug.snapshot.publicUrl))}`))
      expect(debug.dbPodUrl).not.toMatch(/^https:\/\/id\.undefineds\.co\//)
      expect(debug.accessRoute?.canonicalPodUrl).toBe(debug.dbPodUrl)
      expect(normalizeUrl(debug.accessRoute?.canonicalBaseUrl)).toBe(normalizeUrl(debug.snapshot.publicUrl))
      expect(['local', 'lan', 'public', 'canonical']).toContain(debug.accessRoute?.kind)
      expect(debug.accessRoute?.accessBaseUrl).toBeTruthy()
      if (debug.accessRoute?.kind === 'local' || debug.accessRoute?.kind === 'lan') {
        expect(normalizeUrl(debug.accessRoute?.accessBaseUrl)).not.toBe(normalizeUrl(debug.accessRoute?.canonicalBaseUrl))
      } else {
        expect(normalizeUrl(debug.accessRoute?.accessBaseUrl)).toBe(normalizeUrl(debug.accessRoute?.canonicalBaseUrl))
      }
      await expectLocalIngressAcceptsCanonicalCapabilities(debug.snapshot)
      await expectAuthenticatedCanonicalRequestAccepted(page)
      // Cloud remains the identity/profile owner. LinX business data under
      // `.data/` must use the Local SP Pod prefix as RDF subjects.
      const dataSubjects = await readDataSubjects(page)
      const expectedSubjectPrefix = normalizeUrl(debug.dbPodUrl)
      const invalidSubjects = dataSubjects.subjects.filter((subject) => (
        /^https?:\/\//.test(subject)
        && !subject.startsWith(expectedSubjectPrefix)
      ))
      expect(dataSubjects.subjects.some((subject) => subject.startsWith(expectedSubjectPrefix))).toBe(true)
      expect(
        invalidSubjects,
        `Local+Cloud data subjects must stay under the Local SP Pod prefix ${expectedSubjectPrefix}\n${JSON.stringify(dataSubjects, null, 2)}`,
      ).toEqual([])
      expect(
        Object.keys(debug.localStorage).some((key) => key.startsWith('solidClientAuthn:') || key.startsWith('solidClientAuthenticationUser:')),
      ).toBe(true)

      console.log(`[real-local-cloud] usernameField=${registerResult.usedUsernameField} createPod=${consentResult.usedCreatePod} addPod=${consentResult.usedAddPod}`)
    } finally {
      await runtime.stop()
    }
  })
})

async function clickLocalSpaceEntry(page: Page): Promise<void> {
  const productEntry = page.locator('[data-provider-source="local"]').locator('xpath=ancestor::button[1]')
  if (await productEntry.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await productEntry.click()
    return
  }

  await page.getByRole('button', { name: /本地空间|Local/ }).click()
}

async function continueToLocalAccountSurface(page: Page): Promise<void> {
  if (/id\.undefineds\.co|\/\.account\//.test(page.url())) {
    return
  }
  if (await page.getByPlaceholder(/Email(?: address)?/i).isVisible({ timeout: 1_000 }).catch(() => false)) {
    return
  }

  const continueButton = page.getByRole('button', { name: /继续登录|Continue/i })
  if (await continueButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await continueButton.click({ timeout: 5_000 }).catch(() => undefined)
  }

  await page.waitForURL(/id\.undefineds\.co|\/\.account\//, { timeout: 30_000, waitUntil: 'domcontentloaded' })
}

async function registerOnProductionCloud(
  page: Page,
  runtime: Awaited<ReturnType<typeof startRealLocalCloudRuntime>>,
): Promise<{ usedUsernameField: boolean }> {
  const signInGate = page.getByRole('button', { name: /Go to Sign in/i })
  if (await signInGate.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await signInGate.click()
  }

  const emailInput = page.getByPlaceholder(/Email(?: address)?/i)
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 })

  const confirmPasswordInput = page.getByPlaceholder(/Confirm password/i)
  if (!await confirmPasswordInput.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /^Sign up$/i }).click()
    await expect(confirmPasswordInput).toBeVisible({ timeout: 20_000 })
  }

  const usernameInput = page.getByPlaceholder(/^Username$/i)
  const usedUsernameField = await usernameInput.isVisible().catch(() => false)

  if (usedUsernameField) {
    await usernameInput.fill(runtime.username)
  }
  await emailInput.fill(runtime.email)
  await page.getByPlaceholder(/^Password$/i).fill(runtime.password)
  await confirmPasswordInput.fill(runtime.password)
  await ensureProvisionCodeOnCloudPage(page, runtime)

  await Promise.all([
    page.waitForURL(/\/\.account\/(account|oidc\/consent)\//, { timeout: 90_000 }),
    page.getByRole('button', { name: /^Sign up$/i }).click(),
  ])

  return { usedUsernameField }
}

async function provisionAndAuthorize(
  page: Page,
  runtime: Awaited<ReturnType<typeof startRealLocalCloudRuntime>>,
): Promise<{ usedCreatePod: boolean; usedAddPod: boolean }> {
  let usedCreatePod = false
  let usedAddPod = false
  const deadline = Date.now() + 120_000

  while (Date.now() < deadline) {
    const authorizeButton = page.getByRole('button', { name: /Authorize|允许访问/i })
    const missingPodMessage = page.getByText('You need to create a Pod first to get a WebID.')
    const createPodButton = page.getByRole('button', { name: /^Create Pod$/i })
    const addPodButton = page.getByRole('button', { name: /Add Pod/i })
    const continueAuthorizationLink = page.getByRole('link', { name: /^Continue$/i })
    const firstPodNameInput = page.getByPlaceholder(/^alice$/i)
    const createStorageButton = page.getByRole('button', { name: /^Create storage$/i })
    const refreshAuthorizationButton = page.getByRole('button', { name: /^Refresh authorization$/i })

    if (await continueAuthorizationLink.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await Promise.all([
        page.waitForURL(/\/\.account\/oidc\/consent\//, { timeout: 30_000 }),
        continueAuthorizationLink.click(),
      ])
      continue
    }

    if (await createStorageButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      if (!await firstPodNameInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await page.waitForTimeout(500)
        continue
      }
      usedAddPod = true
      await ensureProvisionCodeOnCloudPage(page, runtime)
      try {
        await firstPodNameInput.fill(runtime.localPodName, { timeout: 5_000 })
      } catch {
        await page.waitForTimeout(500)
        continue
      }
      const alreadyExistsMessage = page.getByText(/already\s+(?:used|exists)|is\s+already/i)
      if (await alreadyExistsMessage.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        continue
      }
      await expect(createStorageButton).toBeEnabled({ timeout: 20_000 })
      await createStorageButton.click()
      continue
    }

    if (await refreshAuthorizationButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await refreshAuthorizationButton.click()
      continue
    }

    if (await createPodButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      usedCreatePod = true
      await Promise.all([
        page.waitForURL(/\/\.account\/account\//, { timeout: 30_000 }),
        createPodButton.click(),
      ])
      continue
    }

    if (await addPodButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      usedAddPod = true
      await addPodButton.click()

      const podNameInput = page.getByPlaceholder(/my-pod/i)
      await expect(podNameInput).toBeVisible({ timeout: 20_000 })
      await ensureProvisionCodeOnCloudPage(page, runtime)
      await podNameInput.fill(runtime.localPodName)

      await Promise.all([
        page.waitForLoadState('networkidle'),
        page.getByRole('button', { name: /^Create$/i }).click(),
      ])
      continue
    }

    if (await authorizeButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await expect(missingPodMessage).toHaveCount(0)
      await expect(authorizeButton).toBeEnabled({ timeout: 20_000 })
      await authorizeButton.click()
      return { usedCreatePod, usedAddPod }
    }

    await page.waitForTimeout(500)
  }

  throw new Error(`timed out waiting for consent\n${JSON.stringify(await readPageState(page), null, 2)}`)
}

async function ensureProvisionCodeOnCloudPage(
  page: Page,
  runtime: Awaited<ReturnType<typeof startRealLocalCloudRuntime>>,
): Promise<void> {
  const snapshot = await runtime.getSnapshot()
  const provisionCode = snapshot.provisionCode
  expect(provisionCode, 'Local remote-ready snapshot must expose a Cloud provision code').toBeTruthy()

  await page.evaluate((value) => {
    window.sessionStorage.setItem('provisionCode', value)
  }, provisionCode)

  await expect.poll(
    () => page.evaluate(() => window.sessionStorage.getItem('provisionCode')),
    { timeout: 10_000 },
  ).toBe(provisionCode)
}

async function waitForLocalReady(
  page: Page,
  runtime: Awaited<ReturnType<typeof startRealLocalCloudRuntime>>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const snapshot = await runtime.getSnapshot()
    if (snapshot.state === 'ready') {
      return
    }
    if (snapshot.state === 'error' || snapshot.state === 'repair_required') {
      throw new Error(`Local failed before Cloud login\n${JSON.stringify(await collectDebugState(page, runtime), null, 2)}`)
    }
    await page.waitForTimeout(500)
  }

  throw new Error(`Local did not become ready\n${JSON.stringify(await collectDebugState(page, runtime), null, 2)}`)
}

async function waitForChatPath(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname === '/chat') {
      return true
    }
    await page.waitForTimeout(250)
  }

  return false
}

async function waitForSolidDbReady(page: Page, timeoutMs: number): Promise<void> {
  try {
    await page.waitForFunction(
      () => (window as any).__SOLID_DB_STATUS__ === 'ready' && Boolean((window as any).__SOLID_DB__),
      undefined,
      { timeout: timeoutMs },
    )
  } catch (error) {
    throw new Error(`expected Solid DB to become ready\n${JSON.stringify(await readPageState(page), null, 2)}`, {
      cause: error,
    })
  }
}

async function collectDebugState(page: Page, runtime: Awaited<ReturnType<typeof startRealLocalCloudRuntime>>) {
  const pageState = await readPageState(page)
  const runtimeState = await runtime.getDebugState()

  return {
    ...pageState,
    ...runtimeState,
  }
}

async function readPageState(page: Page) {
  return page.evaluate(() => {
    const parseJson = (value: string | null) => {
      try {
        return value ? JSON.parse(value) : null
      } catch {
        return null
      }
    }
    const isSensitiveKey = (key: string) => /token|secret|password|provisionCode/i.test(key)
    const redact = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(redact)
      if (!value || typeof value !== 'object') return value
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
        key,
        isSensitiveKey(key) && nested ? '<redacted>' : redact(nested),
      ]))
    }
    const readDebugStorage = (storage: Storage) => Object.fromEntries(
      Object.keys(storage)
        .filter((key) => key.startsWith('solid') || key.startsWith('linx') || key.startsWith('oidc'))
        .map((key) => {
          const raw = storage.getItem(key)
          return [
            key,
            isSensitiveKey(key)
              ? '<redacted>'
              : redact(parseJson(raw) ?? raw),
          ]
        }),
    )
    const sessionId = window.localStorage.getItem('solidClientAuthn:currentSession')
    const storedSession = sessionId
      ? window.localStorage.getItem(`solidClientAuthenticationUser:${sessionId}`)
      : null
    const loginStore = parseJson(window.localStorage.getItem('linx-login'))
    const rememberedAccount = parseJson(window.localStorage.getItem('linx-remembered-account'))
    const storedAccount = loginStore?.state?.storedAccount ?? rememberedAccount ?? null

    return {
      url: window.location.href,
      title: document.title,
      body: document.body.innerText,
      dbReady: Boolean((window as any).__SOLID_DB__),
      dbStatus: (window as any).__SOLID_DB_STATUS__ ?? null,
      dbError: (window as any).__SOLID_DB_ERROR__ ?? null,
      dbPodUrl: (window as any).__SOLID_DB_POD_URL__ ?? null,
      accessRoute: (window as any).__LINX_ACCESS_ROUTE__ ?? null,
      loginStore,
      rememberedAccount,
      storedAccount,
      localStorage: readDebugStorage(window.localStorage),
      sessionStorage: readDebugStorage(window.sessionStorage),
      storedSession: redact(parseJson(storedSession)),
    }
  })
}

async function readDataSubjects(page: Page): Promise<{ endpoint: string; podUrl: string; subjects: string[] }> {
  return page.evaluate(async () => {
    const db = (window as any).__SOLID_DB__
    const podUrl = String(
      (window as any).__SOLID_DB_POD_URL__
        ?? db?.getDialect?.()?.getPodUrl?.()
        ?? db?.getPodUrl?.()
        ?? '',
    )
    const rawFetch = (
      db?.getDialect?.()?.getAuthenticatedFetch?.()
        ?? db?.getSession?.()?.fetch
        ?? db?.session?.fetch
    )
    const fetchFn = typeof rawFetch === 'function'
      ? rawFetch.bind(db?.session ?? db)
      : null

    if (!podUrl || !fetchFn) {
      throw new Error('Solid DB Pod URL or authenticated fetch is missing.')
    }

    const endpoint = new URL('.data/-/sparql', podUrl.endsWith('/') ? podUrl : `${podUrl}/`).toString()
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/sparql-query',
      },
      body: 'SELECT DISTINCT ?s WHERE { ?s ?p ?o . FILTER(isIRI(?s)) } ORDER BY ?s',
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`Failed to query Local SP data subjects: HTTP ${response.status} ${text.slice(0, 500)}`)
    }
    const parsed = JSON.parse(text)
    const subjects = Array.isArray(parsed?.results?.bindings)
      ? parsed.results.bindings
        .map((binding: any) => binding?.s?.value)
        .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
      : []

    return { endpoint, podUrl, subjects }
  })
}

async function expectLocalIngressAcceptsCanonicalCapabilities(snapshot: any): Promise<void> {
  const localBaseUrl = normalizeUrl(snapshot?.localUrl)
  const canonicalBaseUrl = normalizeUrl(snapshot?.publicUrl ?? snapshot?.baseUrl)
  expect(localBaseUrl, 'Local snapshot must expose a local access URL').toBeTruthy()
  expect(canonicalBaseUrl, 'Local snapshot must expose a canonical public/base URL').toBeTruthy()

  const canonical = new URL(canonicalBaseUrl)
  const capabilitiesUrl = new URL('/api/linx/capabilities', localBaseUrl).toString()
  const response = await fetch(capabilitiesUrl, {
    headers: {
      Accept: 'application/json',
      'X-Forwarded-Host': canonical.host,
      'X-Forwarded-Proto': canonical.protocol.replace(':', ''),
    },
  })
  const text = await response.text()
  expect(
    response.ok,
    `Local xpod ingress should accept canonical forwarded capabilities probe: HTTP ${response.status} ${text.slice(0, 500)}`,
  ).toBe(true)

  const payload = JSON.parse(text)
  expect(payload.contract).toBe('linx-local-onboarding/v1')
  expect(normalizeUrl(payload.baseUrl)).toBe(canonicalBaseUrl)
}

async function expectAuthenticatedCanonicalRequestAccepted(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    const db = (window as any).__SOLID_DB__
    const podUrl = String(
      (window as any).__SOLID_DB_POD_URL__
        ?? db?.getDialect?.()?.getPodUrl?.()
        ?? db?.getPodUrl?.()
        ?? '',
    )
    const rawFetch = (
      db?.getDialect?.()?.getAuthenticatedFetch?.()
        ?? db?.getSession?.()?.fetch
        ?? db?.session?.fetch
    )
    const fetchFn = typeof rawFetch === 'function'
      ? rawFetch.bind(db?.session ?? db)
      : null

    if (!podUrl || !fetchFn) {
      throw new Error('Solid DB Pod URL or authenticated fetch is missing.')
    }

    const resourceUrl = new URL('agents/__secretary__/AGENTS.md', podUrl.endsWith('/') ? podUrl : `${podUrl}/`).toString()
    const response = await fetchFn(resourceUrl, {
      method: 'GET',
      headers: { Accept: 'text/plain,*/*' },
    })
    const text = await response.text().catch(() => '')
    return {
      url: resourceUrl,
      status: response.status,
      ok: response.ok,
      bodyPreview: text.slice(0, 500),
    }
  })

  expect(
    result.ok,
    `Authenticated canonical request should be accepted by Local SP route: ${result.url} HTTP ${result.status} ${result.bodyPreview}`,
  ).toBe(true)
}

function normalizeUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.trim()) {
    return ''
  }

  return url.trim().endsWith('/') ? url.trim() : `${url.trim()}/`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
