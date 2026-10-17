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

test('问 LinX carries the citation, and editing the message keeps it', async ({ page }) => {
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
})
