import { test } from '@playwright/test'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

test.describe.configure({ mode: 'serial' })

test.describe('Real seeded xpod auth flow', () => {
  let runtime: SeededXpodRuntime

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
    runtime = await startSeededXpodRuntime()
  })

  test.afterAll(async () => {
    await runtime?.stop()
  })

  test('logs into seeded xpod and lands on chat', async ({ page }) => {
    test.setTimeout(120_000)

    await loginToSeededXpod(page, runtime)
    await expectSecretaryInitialized(page)
  })
})
