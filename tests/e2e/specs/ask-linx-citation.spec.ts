import { expect, test, type Page } from '@playwright/test'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

/**
 * R6-C: 问 LinX from a card sends the quoted passage's source as structured context, and an
 * edited message keeps it. The citation lives on the stored user message in the Pod
 * (`.data/chat/…`), so the check reads the Pod. No model answer is needed.
 * Run with LINX_E2E_BROWSER_CHANNEL=chrome when the bundled Chromium is missing.
 */
test.setTimeout(240_000)

let runtime: SeededXpodRuntime

async function putNote(page: Page) {
  await page.evaluate(async () => {
    const w = window as any
    const authFetch = w.__SOLID_DB__.getDialect().getAuthenticatedFetch()
    const base = String(w.__SOLID_DB_POD_URL__).replace(/\/?$/, '/')
    await authFetch(`${base}notes/meeting-notes.md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown' },
      body: '# 会议纪要\n\n维护成本太高，先不自己做。\n',
    })
  })
}

/** Stored resources of the LinX chat (`.data/chat/__secretary__/`) whose text mentions `needle`. */
async function chatResourcesMentioning(page: Page, needle: string): Promise<string[]> {
  return page.evaluate(async (needle) => {
    const w = window as any
    const authFetch = w.__SOLID_DB__.getDialect().getAuthenticatedFetch()
    const base = String(w.__SOLID_DB_POD_URL__).replace(/\/?$/, '/')
    const found: string[] = []
    const seen = new Set<string>()
    const walk = async (url: string, depth: number) => {
      if (seen.has(url) || depth > 5 || seen.size > 200) return
      seen.add(url)
      const response = await authFetch(url, { headers: { Accept: 'text/turtle' }, cache: 'no-store' })
      if (!response.ok) return
      const text = await response.text()
      if (!url.endsWith('/')) {
        if (text.includes(needle)) found.push(text)
        return
      }
      const children = [...text.matchAll(/ldp:contains\s+([^;]+?)(?:;|\.\s*$)/gm)]
        .flatMap((match) => [...match[1].matchAll(/<([^>]+)>/g)].map((item) => new URL(item[1], url).href))
      for (const child of children) await walk(child, depth + 1)
    }
    await walk(`${base}.data/chat/__secretary__/`, 0)
    return found
  }, needle)
}

test.beforeAll(async () => {
  runtime = await startSeededXpodRuntime()
})

test.afterAll(async () => {
  await runtime?.stop?.()
})

test('问 LinX sends the citation to the model on send, edit and retry, and stores it with the message', async ({ page }) => {
  // What the browser hands to the model: every outgoing request body that mentions a test message.
  const modelBodies: string[] = []
  page.on('request', (request) => {
    const body = request.postData()
    if (body && body.includes('citecheck')) modelBodies.push(body)
  })
  const sentToModel = (marker: string) => modelBodies.some((body) => body.includes(marker) && body.includes('meeting-notes.md'))
  await loginToSeededXpod(page, runtime)
  await expectSecretaryInitialized(page)
  await putNote(page)

  await page.evaluate(() => { history.pushState({}, '', '/files'); dispatchEvent(new PopStateEvent('popstate')) })
  await page.getByRole('textbox', { name: '搜索文件树' }).fill('维护成本')
  const hits = page.getByRole('region', { name: '正文里的结果' })
  await expect(hits.getByRole('button').first()).toBeVisible({ timeout: 30_000 })
  await hits.getByRole('button').first().click()
  const card = page.getByRole('dialog')
  const passage = card.getByText('维护成本太高，先不自己做。').first()
  await expect(passage).toBeVisible({ timeout: 20_000 })

  // Select the passage the way a person would: triple-click the paragraph.
  await passage.click({ clickCount: 3 })
  await page.getByRole('button', { name: '问 LinX' }).click()

  await expect(page.getByTestId('composer-citation')).toContainText('meeting-notes', { timeout: 20_000 })
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/composer-with-citation.png` })
  const input = page.getByRole('textbox', { name: '消息' })
  await input.fill('citecheck-alpha 这条为什么不自己做？')
  await input.press('Enter')

  await expect.poll(async () => (await chatResourcesMentioning(page, 'citecheck-alpha')).some((text) => text.includes('meeting-notes.md')), {
    timeout: 60_000,
  }).toBe(true)
  await expect.poll(() => sentToModel('citecheck-alpha'), { timeout: 30_000 }).toBe(true)

  // Edit the sent message: the new version must carry the same citation.
  const sent = page.locator('[data-role="user"]').filter({ hasText: 'citecheck-alpha' }).last()
  await sent.hover()
  await sent.getByRole('button', { name: '更多' }).click()
  await page.getByRole('menuitem', { name: '编辑' }).click()
  const editor = page.getByRole('textbox', { name: '编辑消息' })
  await editor.fill('citecheck-beta 换个问法：为什么先不自己做？')
  await page.locator('[data-role="user"]').filter({ has: editor }).getByRole('button', { name: '发送' }).click()

  await expect.poll(async () => (await chatResourcesMentioning(page, 'citecheck-beta')).some((text) => text.includes('meeting-notes.md')), {
    timeout: 60_000,
  }).toBe(true)
  await expect.poll(() => sentToModel('citecheck-beta'), { timeout: 30_000 }).toBe(true)

  // 重新回答: the answer is asked for again from the stored message, citation included.
  // (This test Pod has no model, so the answer fails; 重试 asks again the same way.)
  const answer = page.locator('[data-role="assistant"]').last()
  const retry = answer.getByRole('button', { name: '重试' })
  await expect(retry).toBeEnabled({ timeout: 60_000 })
  const before = modelBodies.length
  await retry.click()
  await expect.poll(() => modelBodies.slice(before).some((body) => body.includes('citecheck-beta') && body.includes('meeting-notes.md')), {
    timeout: 30_000,
  }).toBe(true)
})
