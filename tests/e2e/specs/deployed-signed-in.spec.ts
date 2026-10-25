import { expect, test, type Page } from '@playwright/test'
import { fillCustomLoginProvider, getLoginDialog, selectLoginSpace } from '../helpers/login-ui'
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

let runtime: SeededXpodRuntime | null = null
let account: ProviderAccount | null = null
let loginVia: 'cloud' | 'custom' = 'cloud'

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

async function signIn(page: Page) {
  await page.goto('/')
  if (loginVia === 'cloud') {
    await selectLoginSpace(page, 'cloud')
  } else {
    await fillCustomLoginProvider(page, account!.baseUrl)
    await getLoginDialog(page).getByRole('button', { name: '继续' }).click()
  }
  const providerOrigin = new URL(account!.baseUrl).origin
  await page.waitForURL((url) => url.origin === providerOrigin, { timeout: 60_000 })
  await signInToSeededRuntime(page, account!)
  await authorizeSeededRuntime(page, account!)
  await page.waitForURL((url) => url.origin !== providerOrigin, { timeout: 60_000 })
  await expectSecretaryVisible(page, 90_000)
  await waitForSolidDbReady(page)
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
  await signIn(page)
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
})
