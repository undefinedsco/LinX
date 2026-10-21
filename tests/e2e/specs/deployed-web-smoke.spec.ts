import { expect, test } from '@playwright/test'
import { selectLoginSpace } from '../helpers/login-ui'

/**
 * Smoke for a deployed LinX Web (RC or production), run by .github/workflows/candidate.yml.
 *
 *   LINX_E2E_BASE_URL            the deployed site, e.g. https://linx.sealosgzg.site
 *   LINX_E2E_CLOUD_IDENTITY_URL  the provider the build points at, e.g. https://id.undefineds.co
 *   LINX_E2E_EXPECT_VERSION      optional: the candidate version in /version.json
 *
 * Read-only: it loads the site and follows the cloud login to the provider's sign-in page,
 * without signing in or writing anything.
 */
const siteUrl = process.env.LINX_E2E_BASE_URL ?? ''
const identityUrl = (process.env.LINX_E2E_CLOUD_IDENTITY_URL ?? '').replace(/\/$/, '')
const expectedVersion = process.env.LINX_E2E_EXPECT_VERSION?.trim()

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  test.skip(!siteUrl, 'deployed-site smoke: set LINX_E2E_BASE_URL to the site to check')
  expect(identityUrl, 'LINX_E2E_CLOUD_IDENTITY_URL is required').not.toBe('')
})

test('the site and client-side routes load', async ({ page, request }) => {
  for (const path of ['/', '/chat', '/files']) {
    const response = await request.get(path)
    expect(response.status(), `${path} must answer 200`).toBe(200)
    expect(response.headers()['content-type'] ?? '').toContain('text/html')
  }
  const missing = await request.get('/assets/does-not-exist.js')
  expect(missing.status(), 'a missing asset must be a real 404, not the app shell').toBe(404)

  await page.goto('/')
  await expect(page.getByRole('dialog', { name: '登录 LinX' })).toBeVisible({ timeout: 30_000 })
  if (expectedVersion) {
    // candidate.yml writes version.json next to the build (version + source commit).
    const version = await request.get('/version.json')
    expect(version.status()).toBe(200)
    const info = await version.json()
    expect(info.version, 'the site must serve the candidate being accepted').toBe(expectedVersion)
    // Module files (the pdf.js worker) must be served as JavaScript, or browsers refuse them.
    for (const modulePath of info.modules ?? []) {
      const moduleResponse = await request.get(modulePath)
      expect(moduleResponse.status(), modulePath).toBe(200)
      expect(moduleResponse.headers()['content-type'] ?? '', modulePath).toContain('javascript')
    }
  }
  const home = await request.get('/')
  expect(home.headers()['x-content-type-options']).toBe('nosniff')
  expect(home.headers()['referrer-policy']).toBe('same-origin')
})

test('cloud login goes to the configured provider', async ({ page, request }) => {
  const discovery = await request.get(`${identityUrl}/.well-known/openid-configuration`)
  expect(discovery.status()).toBe(200)
  expect(new URL((await discovery.json()).issuer).origin).toBe(new URL(identityUrl).origin)

  await page.goto('/')
  await selectLoginSpace(page, 'cloud')
  await page.waitForURL((url) => url.origin === new URL(identityUrl).origin, { timeout: 30_000 })
  expect(new URL(page.url()).origin).toBe(new URL(identityUrl).origin)
})
