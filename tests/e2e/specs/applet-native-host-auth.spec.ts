import { expect, test } from '@playwright/test'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'

let runtime: SeededXpodRuntime

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000)
  runtime = await startSeededXpodRuntime()
})

test.afterAll(async () => {
  await runtime?.stop()
})

test('native host 可行：LinX origin 跨域 Solid authFetch 调通 xpod 管理 API', async ({ page }) => {
  test.setTimeout(240_000)

  await loginToSeededXpod(page, runtime)

  const result = await page.evaluate(async (baseUrl) => {
    const db = (window as unknown as {
      __SOLID_DB__?: { getDialect?: () => { getAuthenticatedFetch?: () => typeof fetch } }
    }).__SOLID_DB__
    const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
    if (!authFetch) {
      return { fatal: 'no authFetch on __SOLID_DB__' }
    }

    const targets = [
      'api/ai/connections/providers',
      'api/applets/service-access/ai-connection',
      'api/ai/gateway/keys',
      'api/ai/client-configuration/capability',
      'v1/models',
    ]
    const out: Record<string, { status?: number; body?: string; error?: string }> = {}
    for (const path of targets) {
      try {
        const res = await authFetch(`${baseUrl}${path}`)
        out[path] = { status: res.status, body: (await res.text()).slice(0, 400) }
      } catch (error) {
        out[path] = { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
      }
    }
    return out
  }, runtime.baseUrl)

  console.log(`\n=== SPIKE RESULT ===\n${JSON.stringify(result, null, 2)}\n====================\n`)

  expect(result['api/ai/connections/providers']?.status).toBe(200)
  expect(result['api/applets/service-access/ai-connection']?.status).toBe(200)
  expect(result['api/ai/client-configuration/capability']?.status).toBe(200)
  expect(result['v1/models']?.status).toBe(200)
  // 已知缺口：0.3.71 seeded 包未注册 /api/ai/gateway/keys（404），xpod 源码侧需确认
})
