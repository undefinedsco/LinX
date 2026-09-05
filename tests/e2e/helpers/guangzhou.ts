import { expect, type Page } from '@playwright/test'

export const GUANGZHOU_WEB_URL = 'https://undefineds-gz.sealosgzg.site'
export const GUANGZHOU_IDENTITY_URL = 'https://undefineds-gz-id.sealosgzg.site'
export const GUANGZHOU_API_URL = 'https://undefineds-gz-api.sealosgzg.site'
export const OFFICIAL_IDENTITY_HOST = 'id.undefineds.co'

export function assertGuangzhouOrigin(value: string, label: string): void {
  const actual = new URL(value).origin
  const expected = new URL(label === 'Web' ? GUANGZHOU_WEB_URL : label === 'Identity' ? GUANGZHOU_IDENTITY_URL : GUANGZHOU_API_URL).origin
  expect(actual, `${label} must stay on the Guangzhou deployment`).toBe(expected)
}

export async function assertGuangzhouLoginRedirect(page: Page): Promise<void> {
  const requests: string[] = []
  const onRequest = (request: { url(): string }) => requests.push(request.url())
  page.on('request', onRequest)

  try {
    const loginButton = page.getByRole('button', { name: /^登录$/ })
    await expect(loginButton).toBeVisible({ timeout: 20_000 })
    await Promise.all([
      page.waitForURL(/undefineds-gz-id\.sealosgzg\.site\//, { timeout: 30_000 }),
      loginButton.click(),
    ])
    assertGuangzhouOrigin(page.url(), 'Identity')
    expect(
      requests.some((requestUrl) => new URL(requestUrl).hostname === OFFICIAL_IDENTITY_HOST),
      'Guangzhou login must not contact the official identity host',
    ).toBe(false)
  } finally {
    page.off('request', onRequest)
  }
}
