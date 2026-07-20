import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'

test.describe.configure({ mode: 'serial' })

const screenshotDir = resolve(__dirname, '../../../.gstack/qa-reports/screenshots')

test.describe('Chat complete flow with real xpod persistence', () => {
  let runtime: SeededXpodRuntime

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
    runtime = await startSeededXpodRuntime()
    await mkdir(screenshotDir, { recursive: true })
  })

  test.afterAll(async () => {
    await runtime?.stop()
  })

  test('login → provider → chat stream → Pod data → reload restore', async ({ page }) => {
    test.setTimeout(180_000)
    const runId = Date.now()
    const prompt = `CHAT E2E USER ${runId}`
    const reply = `CHAT E2E ASSISTANT ${runId}`
    const browserErrors: string[] = []
    let providerRequestBody: Record<string, unknown> | null = null

    page.on('pageerror', (error) => browserErrors.push(error.message))
    page.on('response', (response) => {
      if (response.status() >= 400 && !isExpectedBootstrapResponse(response.status(), response.request().method(), response.url())) {
        browserErrors.push(`HTTP ${response.status()} ${response.request().method()} ${response.url()}`)
      }
    })
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        browserErrors.push(message.text())
      }
    })

    await page.route(/qa-chat\.invalid\/v1\/models$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'gpt-5.5-qa', name: 'GPT-5.5 QA' }] }),
      })
    })
    await page.route(/qa-chat\.invalid\/v1\/chat\/completions$/, async (route) => {
      providerRequestBody = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: [
          `data: ${JSON.stringify({ choices: [{ delta: { content: reply.slice(0, 12) } }] })}`,
          `data: ${JSON.stringify({ choices: [{ delta: { content: reply.slice(12) } }] })}`,
          'data: [DONE]',
          '',
        ].join('\n\n'),
      })
    })

    await loginToSeededXpod(page, runtime)
    await expect(page).toHaveURL(/\/chat$/)
    await expect(page.getByText('AI Secretary').first()).toBeVisible({ timeout: 30_000 })

    await navigateSpa(page, '/model-services')
    await page.getByRole('button', { name: '添加模型服务' }).click()
    await page.locator('#model-service-name').fill('QA Chat Provider')
    await page.locator('#model-service-key').fill('sk-qa-chat-disposable')
    await page.locator('#model-service-endpoint').fill('https://qa-chat.invalid')
    await page.getByRole('button', { name: '同步模型' }).click()
    await expect(page.getByText('已同步 1 个模型').first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: '创建服务' }).click()
    await expect(page.getByText('QA Chat Provider').first()).toBeVisible({ timeout: 20_000 })

    const enableSwitch = page.getByRole('switch', { name: '启用服务' })
    if (await enableSwitch.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await enableSwitch.click()
      await expect(page.getByRole('switch', { name: '停用服务' })).toBeVisible({ timeout: 20_000 })
    }

    await navigateSpa(page, '/chat')
    await page.getByText('AI Secretary').first().click()
    const chatkit = page.locator('openai-chatkit').first()
    await expect(chatkit).toBeVisible({ timeout: 30_000 })
    const chatFrame = page.locator('iframe').last().contentFrame()
    const modelButton = chatFrame.getByRole('button', { name: /LinX Lite/ })
    await expect(modelButton).toBeVisible({ timeout: 30_000 })
    await modelButton.click()
    await chatFrame.getByText('QA Chat Provider / GPT-5.5 QA', { exact: true }).click()
    const composer = chatFrame.getByRole('textbox').first()
    await expect(composer).toBeVisible({ timeout: 30_000 })

    await composer.fill(prompt)
    await composer.press('Enter')
    await expect(chatFrame.getByText(prompt, { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(chatFrame.getByText(reply, { exact: true })).toBeVisible({ timeout: 60_000 })
    await page.screenshot({ path: resolve(screenshotDir, 'chat-full-flow-stream-complete.png'), fullPage: true })

    expect(providerRequestBody).toMatchObject({ model: 'gpt-5.5-qa', stream: true })
    expect(JSON.stringify(providerRequestBody)).toContain(prompt)

    const podEvidence = await queryPodMessageEvidence(page, [prompt, reply])
    expect(podEvidence.endpoint).toContain('/.data/chat/-/sparql')
    expect(podEvidence.matches[prompt]?.length).toBeGreaterThan(0)
    expect(podEvidence.matches[reply]?.length).toBeGreaterThan(0)
    expect(podEvidence.matches[prompt]?.[0]?.subject).toBeTruthy()
    expect(podEvidence.matches[reply]?.[0]?.subject).toBeTruthy()
    console.log(`[pod-evidence] ${JSON.stringify(podEvidence)}`)

    await page.reload()
    await expect(page.getByText('AI Secretary').first()).toBeVisible({ timeout: 30_000 })
    await page.getByText('AI Secretary').first().click()
    const restoredChatkit = page.locator('openai-chatkit').first()
    await expect(restoredChatkit).toBeVisible({ timeout: 30_000 })
    const restoredFrame = page.locator('iframe').last().contentFrame()
    await expect(restoredFrame.getByText(prompt, { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(restoredFrame.getByText(reply, { exact: true })).toBeVisible({ timeout: 30_000 })

    await page.setViewportSize({ width: 390, height: 844 })
    const mobilePrompt = restoredFrame.getByText(prompt, { exact: true })
    const mobileReply = restoredFrame.getByText(reply, { exact: true })
    await expect(mobilePrompt).toBeVisible()
    await expect(mobileReply).toBeVisible()
    for (const message of [mobilePrompt, mobileReply]) {
      const box = await message.boundingBox()
      expect(box, 'mobile message must have a measurable box').not.toBeNull()
      expect(box!.x, 'mobile message must not be clipped on the left').toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width, 'mobile message must not be clipped on the right').toBeLessThanOrEqual(390)
    }
    const chatkitHasHorizontalOverflow = await restoredFrame.locator('html').evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1,
    )
    expect(chatkitHasHorizontalOverflow).toBe(false)
    await expect(page.getByRole('button', { name: '返回会话列表' })).toBeVisible()
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(hasHorizontalOverflow).toBe(false)
    await page.screenshot({ path: resolve(screenshotDir, 'chat-full-flow-mobile-restored.png'), fullPage: true })
    expect(browserErrors).toEqual([])
  })
})

function isExpectedBootstrapResponse(status: number, method: string, url: string): boolean {
  const path = new URL(url).pathname
  if (status === 404 && method === 'GET') {
    return /\/\.data\/(?:contacts\/__secretary__\.ttl|chat\/(?:__secretary__|default)\/index\.ttl)$/.test(path)
  }
  if (status === 412 && method === 'PUT') {
    return /\/agents\/__secretary__\/(?:AGENTS\.md|skills\/README\.md)$/.test(path)
  }
  return false
}

async function navigateSpa(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}$`))
}

async function loginToSeededXpod(page: Page, runtime: SeededXpodRuntime): Promise<void> {
  await page.goto('/')
  await expect(page.getByText('数据保存位置')).toBeVisible({ timeout: 20_000 })
  await page.getByText('其他账号供应商').click()
  await page.getByRole('button', { name: /添加供应商/ }).click()
  await page.getByPlaceholder('https://pod.example.com').fill(runtime.baseUrl)
  await Promise.all([
    page.waitForURL(new RegExp(new URL(runtime.baseUrl).origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 30_000 }),
    page.getByRole('button', { name: '连接' }).click(),
  ])

  const signInGate = page.getByRole('button', { name: /Go to Sign in/i })
  if (await signInGate.isVisible({ timeout: 5_000 }).catch(() => false)) await signInGate.click()
  await page.getByPlaceholder(/Email(?: address)?/i).fill(runtime.email)
  await page.getByPlaceholder(/^Password$/i).fill(runtime.password)
  await page.getByRole('button', { name: /^Sign in$/i }).click()

  const authorize = page.getByRole('button', { name: /Authorize|允许访问/i })
  await expect(authorize).toBeVisible({ timeout: 30_000 })
  await expect(authorize).toBeEnabled()
  await authorize.click()
  await page.waitForURL(/\/chat$/, { timeout: 60_000 })
  await page.waitForFunction(() => Boolean((window as any).__SOLID_DB__), undefined, { timeout: 30_000 })
}

async function queryPodMessageEvidence(page: Page, markers: string[]) {
  return page.evaluate(async (expectedMarkers) => {
    const db = (window as any).__SOLID_DB__
    const podUrl = String((window as any).__SOLID_DB_POD_URL__ ?? db?.getDialect?.()?.getPodUrl?.() ?? '')
    const rawFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
    if (!podUrl || typeof rawFetch !== 'function') throw new Error('authenticated Pod query is unavailable')
    const fetchFn = rawFetch.bind(db)
    const endpoint = new URL('.data/chat/-/sparql', podUrl.endsWith('/') ? podUrl : `${podUrl}/`).toString()
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/sparql-query',
      },
      body: 'SELECT ?s ?p ?o WHERE { ?s ?p ?o . FILTER(isLiteral(?o)) } ORDER BY ?s ?p',
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`Pod SPARQL query failed: ${response.status} ${text.slice(0, 500)}`)
    const bindings = JSON.parse(text)?.results?.bindings ?? []
    const matches = Object.fromEntries(expectedMarkers.map((marker) => [
      marker,
      bindings
        .filter((binding: any) => String(binding?.o?.value ?? '').includes(marker))
        .map((binding: any) => ({
          subject: binding?.s?.value,
          predicate: binding?.p?.value,
          value: binding?.o?.value,
        })),
    ]))
    return { endpoint, podUrl, matches }
  }, markers)
}
