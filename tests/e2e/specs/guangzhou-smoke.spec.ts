import { expect, test } from '@playwright/test'
import {
  assertGuangzhouLoginRedirect,
  assertGuangzhouOrigin,
  GUANGZHOU_API_URL,
  GUANGZHOU_IDENTITY_URL,
  GUANGZHOU_WEB_URL,
} from '../helpers/guangzhou'

test.describe.configure({ mode: 'serial' })

test.beforeEach(({ baseURL }) => {
  expect(baseURL).toBe(GUANGZHOU_WEB_URL)
})

test.describe('Guangzhou deployment smoke', () => {
  test('Web loads and login stays on Guangzhou Identity', async ({ page }) => {
    const response = await page.goto('/chat', { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBe(200)
    assertGuangzhouOrigin(page.url(), 'Web')

    await assertGuangzhouLoginRedirect(page)
    await expect(page.getByText('Xpod', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('textbox', { name: /^(Email|邮箱)$/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('textbox', { name: /^(Password|密码)$/i })).toBeVisible({ timeout: 20_000 })
  })

  test('Identity discovery and ChatKit health are served by Guangzhou', async ({ request }) => {
    const identityResponse = await request.get(`${GUANGZHOU_IDENTITY_URL}/.well-known/openid-configuration`)
    expect(identityResponse.status()).toBe(200)
    const identity = await identityResponse.json()
    expect(new URL(identity.issuer).origin).toBe(GUANGZHOU_IDENTITY_URL)

    const healthResponse = await request.get(`${GUANGZHOU_API_URL}/v1/chatkit/health`)
    expect(healthResponse.status()).toBe(200)
    assertGuangzhouOrigin(healthResponse.url(), 'API')
  })
})
