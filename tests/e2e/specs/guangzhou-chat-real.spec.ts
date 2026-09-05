import { expect, test, type Locator, type Page } from '@playwright/test'
import path from 'node:path'

import { GUANGZHOU_IDENTITY_URL, GUANGZHOU_WEB_URL, OFFICIAL_IDENTITY_HOST } from '../helpers/guangzhou'

const email = process.env.LINX_E2E_EMAIL ?? ''
const password = process.env.LINX_E2E_PASSWORD ?? ''

test.describe.configure({ mode: 'serial' })

test.describe('Guangzhou real Chat acceptance', () => {
  test('authenticates against Guangzhou and exercises persisted model and attachment flows', async ({ page }) => {
    test.skip(!email || !password, 'LINX_E2E_EMAIL and LINX_E2E_PASSWORD are required')
    test.setTimeout(20 * 60_000)

    const requestedHosts = new Set<string>()
    const chatKitErrors: string[] = []
    page.on('console', message => {
      if (/chatkit/i.test(message.text())) console.log(`[browser] ${message.type()}: ${message.text()}`)
    })
    page.on('request', request => requestedHosts.add(new URL(request.url()).hostname))
    page.on('response', async response => {
      if (response.status() >= 500) {
        console.log(`[e2e] AI runtime ${response.status()}: ${(await response.text().catch(() => '')).slice(0, 2_000)}`)
      }
      if (!response.url().includes('/v1/chatkit')) return
      const body = await response.text().catch(() => '')
      if (/"type":"error"|"error":\s*\{/i.test(body)) chatKitErrors.push(body.slice(-2_000))
    })
    await login(page)
    console.log('[e2e] Guangzhou login complete')
    expect(new URL(page.url()).origin).toBe(GUANGZHOU_WEB_URL)
    expect(requestedHosts.has(OFFICIAL_IDENTITY_HOST)).toBe(false)

    await ensureProviderCapability(page, '图片输入')
    console.log('[e2e] Provider capability ready')
    await createAcceptanceChat(page)
    console.log('[e2e] Acceptance chat created')

    const chat = page.frameLocator('iframe[name="chatkit"]')
    const composer = chat.getByRole('textbox', { name: '输入消息...' })
    await expect(composer).toBeVisible({ timeout: 60_000 })
    await waitForChatThreadReady(page)

    const marker = `GZ-REAL-${Date.now()}`
    const markerPrompt = `广州真实验收：请只回复“${marker}”。`
    await send(chat, composer, markerPrompt)
    await expect(chat.getByText(markerPrompt, { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(chat.getByText(marker, { exact: true })).toBeVisible({ timeout: 120_000 })
    console.log('[e2e] Initial real response received')
    await waitForIdle(page)

    await page.reload()
    await waitForChatThreadReady(page)
    await expect(chat.getByText(marker, { exact: true })).toBeVisible({ timeout: 90_000 })
    console.log('[e2e] Thread restored after reload')

    await send(chat, composer, '请严格用 Markdown 回复：包含二级标题“广州验收”、两列表格（项目/状态），以及 JavaScript 代码块 console.log("gz-ok")。')
    await expect(chat.getByRole('heading', { name: '广州验收', level: 2 })).toBeVisible({ timeout: 120_000 })
      .catch(error => {
        throw new Error(`${String(error)}\nChatKit errors:\n${chatKitErrors.join('\n')}`)
      })
    await expect(chat.getByRole('table').last()).toBeVisible()
    await expect(chat.locator('pre code').last()).toContainText('console.log("gz-ok")')
    await waitForIdle(page)

    const fixture = path.resolve(__dirname, '../fixtures/guangzhou-chat-acceptance.txt')
    await chat.locator('input[type="file"]').setInputFiles(fixture)
    await expect(chat.getByText('guangzhou-chat-acceptance.txt')).toBeVisible({ timeout: 30_000 })
    await send(chat, composer, '读取附件，只回复附件第一行的校验码。')
    await expect(chat.getByText('LINX-GZ-E2E-FILE-20260904', { exact: true })).toBeVisible({ timeout: 120_000 })
    await waitForIdle(page)

    await chat.locator('input[type="file"]').setInputFiles({
      name: 'guangzhou-acceptance.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(createMinimalPdf('LINX-GZ-E2E-PDF-20260905')),
    })
    await expect(chat.getByText('guangzhou-acceptance.pdf')).toBeVisible({ timeout: 30_000 })
    await send(chat, composer, '读取 PDF，只回复其中的校验码。')
    await expect(chat.getByText('LINX-GZ-E2E-PDF-20260905', { exact: true })).toBeVisible({ timeout: 120_000 })
    await waitForIdle(page)

    // Keep the visual marker intentionally short. Long digit sequences test
    // OCR transcription noise rather than whether the image reached the
    // multimodal model (one otherwise-correct run dropped a repeated digit).
    const visionMarker = `GZV-${Date.now().toString(36).slice(-6).toUpperCase()}`
    const visionPage = await page.context().newPage()
    await visionPage.setContent(`
      <main style="width: 900px; height: 500px; display: grid; place-items: center; background: #f2efff; color: #392a75;">
        <section style="text-align: center; font-family: sans-serif;">
          <div style="font-size: 140px; line-height: 1;">▲</div>
          <div style="font-size: 64px; font-weight: 700; letter-spacing: 3px;">${visionMarker}</div>
        </section>
      </main>
    `)
    const visionImage = await visionPage.locator('main').screenshot()
    await visionPage.close()
    await chat.locator('input[type="file"]').setInputFiles({
      name: 'guangzhou-vision.png',
      mimeType: 'image/png',
      buffer: visionImage,
    })
    // ChatKit renders image attachments as a thumbnail without exposing the
    // filename as accessible text. Assert the actual preview instead.
    await expect(chat.locator('img[src^="blob:"]').last()).toBeVisible({ timeout: 30_000 })
    await send(chat, composer, '查看图片，只回复图片中的英文校验码，不要回复其他内容。')
    const imageAnswer = chat.locator('article[data-thread-turn="assistant"]').last()
    // OCR-capable models may normalize the letter case while preserving the
    // complete code. Treat that harmless presentation difference as valid.
    await expect(imageAnswer).toContainText(new RegExp(visionMarker, 'i'), { timeout: 120_000 })
    await waitForIdle(page)

    const assistantTurns = chat.locator('article[data-thread-turn="assistant"]')

    // Feedback is sent through ChatKit and persisted by the local Pod-backed
    // store using the item id produced by the real model response.
    await imageAnswer.getByRole('button', { name: 'Thumbs up' }).click()

    // Historical attachments are exposed through the same ChatKit command
    // menu as the composer. Open the persisted list, preview the image and
    // download the text file to prove the stored resources remain usable.
    await selectCommand(chat, composer, /^查看会话附件/)
    const attachmentsDialog = page.getByRole('dialog', { name: '会话附件' })
    await expect(attachmentsDialog).toBeVisible({ timeout: 30_000 })
    await attachmentsDialog.getByRole('button', { name: '打开 guangzhou-vision.png' }).click({ timeout: 30_000 })
    await expect(page.getByRole('dialog', { name: 'guangzhou-vision.png' })).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press('Escape')
    const downloadPromise = page.waitForEvent('download')
    await attachmentsDialog.getByRole('button', { name: '下载 guangzhou-chat-acceptance.txt' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('guangzhou-chat-acceptance.txt')
    await page.keyboard.press('Escape')

    // Regenerate a compact answer and prove both sibling answers remain
    // navigable instead of replacing one another.
    await imageAnswer.getByRole('button', { name: 'Regenerate message' }).click()
    await waitForIdle(page)
    await selectCommand(chat, composer, /^上一个回答版本$/)
    await selectCommand(chat, composer, /^下一个回答版本$/)

    // Editing the latest question creates a sibling user-message branch and
    // regenerates from the edited prompt. Verify both branch directions and
    // that the selected branch survives a full reload.
    const editedMarker = `GZ-EDIT-${Date.now()}`
    await selectCommand(chat, composer, /^编辑最近提问$/)
    const editDialog = page.getByRole('dialog', { name: '编辑消息' })
    await editDialog.getByRole('textbox', { name: '消息内容' }).fill(`请只回复“${editedMarker}”。`)
    await editDialog.getByRole('button', { name: '保存并重新生成' }).click()
    await expect(editDialog).toBeHidden({ timeout: 30_000 })
    await expect(chat.locator('article[data-thread-turn="user"]').last()).toContainText(editedMarker, { timeout: 120_000 })
      .catch(error => {
        throw new Error(`${String(error)}\nChatKit errors:\n${chatKitErrors.join('\n')}`)
      })
    await expect(chat.locator('article[data-thread-turn="assistant"]').last()).toContainText(editedMarker, { timeout: 120_000 })
    await waitForIdle(page)
    await selectCommand(chat, composer, /^上一个提问版本$/)
    await selectCommand(chat, composer, /^下一个提问版本$/)
    await page.reload()
    await expect(chat.locator('article[data-thread-turn="assistant"]').last()).toContainText(editedMarker, { timeout: 90_000 })

    const assistantTurnCountBeforeStop = await assistantTurns.count()
    await send(chat, composer, '请持续输出一篇至少一万字的广州系统技术文章，不要总结，不要提前结束。')
    const stop = page.getByRole('button', { name: '停止生成' })
    await expect(stop).toBeVisible({ timeout: 30_000 })
    const interruptedAnswer = assistantTurns.nth(assistantTurnCountBeforeStop)
    // Stop while the request is genuinely in flight. Waiting for a sizeable
    // answer first races fast providers: the response can finish and remove
    // the button between the assertion and click.
    await page.waitForTimeout(750)
    await stop.click()
    await expect(stop).toBeHidden({ timeout: 30_000 })
    const partialAnswer = (await interruptedAnswer.innerText()).trim()

    await page.reload()
    const restoredAssistantTurns = chat.locator('article[data-thread-turn="assistant"]')
    await expect(restoredAssistantTurns).toHaveCount(assistantTurnCountBeforeStop + 1, { timeout: 90_000 })
    const restoredInterruptedAnswer = restoredAssistantTurns.nth(assistantTurnCountBeforeStop)
    await expect(restoredInterruptedAnswer).toBeVisible({ timeout: 90_000 })
    if (partialAnswer.length > 0) {
      await expect(restoredInterruptedAnswer).toContainText(partialAnswer.slice(0, 20))
    }

    expect(requestedHosts.has(OFFICIAL_IDENTITY_HOST)).toBe(false)
  })

  test('generates and persists a real image through the Guangzhou provider', async ({ page }) => {
    test.skip(!email || !password, 'LINX_E2E_EMAIL and LINX_E2E_PASSWORD are required')
    test.setTimeout(8 * 60_000)

    const chatKitErrors: string[] = []
    page.on('response', async response => {
      if (!response.url().includes('/v1/chatkit')) return
      const body = await response.text().catch(() => '')
      if (/"type":"error"|"error":\s*\{/i.test(body)) chatKitErrors.push(body.slice(-4_000))
    })

    await login(page)
    await ensureProviderCapability(page, '图片生成')
    await createAcceptanceChat(page)

    const chat = page.frameLocator('iframe[name="chatkit"]')
    const composer = chat.getByRole('textbox', { name: '输入消息...' })
    await expect(composer).toBeVisible({ timeout: 60_000 })
    await waitForChatThreadReady(page)

    await composer.fill('/生成图片')
    await expect(chat.getByText('生成图片', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await composer.press('ArrowDown')
    await composer.press('Enter')
    const imageComposer = chat.getByRole('textbox', { name: '描述希望生成的图片...' })
    await expect(imageComposer).toBeVisible({ timeout: 30_000 })
    await expect(chat.getByRole('button', { name: '图片' })).toBeVisible()
    await send(chat, imageComposer, '生成一张白色背景、中央只有一个紫色三角形的测试图片，不要文字。')

    const generatedImageAnswer = chat.locator('article[data-thread-turn="assistant"]').last()
    await expect(generatedImageAnswer).toContainText('已生成图片', { timeout: 180_000 })
    await expect.poll(() => countLoadedContentImages(chat.locator('img')), { timeout: 60_000 })
      .toBeGreaterThan(0)
      .catch(error => {
        throw new Error(`${String(error)}\nChatKit errors:\n${chatKitErrors.join('\n')}`)
      })
    await waitForIdle(page)

    await page.reload()
    await waitForChatThreadReady(page)
    const restoredAnswer = chat.locator('article[data-thread-turn="assistant"]').last()
    await expect(restoredAnswer).toContainText('已生成图片', { timeout: 90_000 })
    await expect.poll(() => countLoadedContentImages(chat.locator('img')), { timeout: 60_000 })
      .toBeGreaterThan(0)
  })
})

async function countLoadedContentImages(images: Locator): Promise<number> {
  return images.evaluateAll(elements => elements.filter(element => {
    const image = element as HTMLImageElement
    // ChatKit uses small image elements for control icons. A generated image
    // must have decoded content dimensions large enough to be message media.
    return image.complete && image.naturalWidth >= 64 && image.naturalHeight >= 64
  }).length)
}

async function login(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${GUANGZHOU_WEB_URL}/chat`)
    if (new URL(page.url()).origin === GUANGZHOU_WEB_URL) {
      const login = page.getByRole('button', { name: /^登录$/ })
      const surface = await Promise.race([
        login.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'login' as const),
        page.getByText('LinX 主理人', { exact: true }).first()
          .waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'chat' as const),
      ]).catch(() => 'unknown' as const)
      if (surface === 'chat') return
      if (surface !== 'login') continue

      const closeError = page.getByRole('button', { name: '关闭错误提示' })
      if (await closeError.isVisible().catch(() => false)) await closeError.click()
      // The OIDC client registration is initialized asynchronously after the
      // login surface renders. Give it one event turn before starting auth.
      await page.waitForTimeout(750)
      await login.click()
      const redirected = await page.waitForURL(url => url.origin === GUANGZHOU_IDENTITY_URL, { timeout: 25_000 })
        .then(() => true, () => false)
      if (!redirected) continue
    }

    if (new URL(page.url()).origin === GUANGZHOU_IDENTITY_URL) {
      const emailInput = page.locator('input[name="email"]')
      await emailInput.waitFor({ state: 'visible', timeout: 30_000 })
      await emailInput.fill(email)
      await page.locator('input[name="password"]').fill(password)
      await page.locator('button[type="submit"]').click()
      const reachedConsent = await page.waitForURL(/\/\.account\/oidc\/consent\//, { timeout: 30_000 })
        .then(() => true, () => false)
      // Xpod may finish a fresh password login on the account home page. The
      // next loop restarts the pending LinX authorization with that session.
      if (!reachedConsent) continue
      await page.getByRole('button', { name: /^(批准|Authorize)$/ }).click()
      const completed = await page.waitForURL(
        url => url.origin === GUANGZHOU_WEB_URL && url.pathname === '/chat',
        { timeout: 90_000 },
      ).then(() => true, () => false)
      if (completed && await waitForAuthenticatedChat(page)) return
    }
  }

  throw new Error('Guangzhou OIDC login did not complete after four attempts')
}

async function waitForAuthenticatedChat(page: Page): Promise<boolean> {
  return page.getByText('LinX 主理人', { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 45_000 })
    .then(() => true, () => false)
}

async function ensureProviderCapability(page: Page, label: string): Promise<void> {
  await page.goto(`${GUANGZHOU_WEB_URL}/model-services`)
  await expect(page.getByText('OpenAI', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
  await page.getByText('OpenAI', { exact: true }).first().click()
  const enable = page.getByRole('switch', { name: `开启 ${label}` })
  if (await enable.isVisible({ timeout: 60_000 }).catch(() => false)) {
    const persisted = page.waitForResponse(response =>
      response.request().method() !== 'GET'
      && response.url().includes('/settings/providers/openai.ttl'),
    )
    await enable.click()
    expect((await persisted).ok()).toBe(true)
    // Updating a provider is a small transaction (provider row plus related
    // model rows). The first Pod response does not mean the complete save
    // chain has settled, so do not navigate away while the click handler is
    // still persisting the remaining writes.
    await expect(page.getByRole('switch', { name: `关闭 ${label}` })).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(1_000)
    await page.reload()
    await expect(page.getByText('OpenAI', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
    await page.getByText('OpenAI', { exact: true }).first().click()
  }
  await expect(page.getByRole('switch', { name: `关闭 ${label}` })).toBeVisible({ timeout: 60_000 })
  await page.goto(`${GUANGZHOU_WEB_URL}/chat`)
  await expect(page.getByText('LinX 主理人', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
}

async function createAcceptanceChat(page: Page): Promise<void> {
  await page.getByRole('button', { name: '新建聊天' }).click()
  await page.getByRole('menuitem', { name: '创建助手' }).click()
  const dialog = page.getByRole('dialog', { name: '创建聊天' })
  await expect(dialog).toBeVisible()
  const name = `广州真实验收 ${Date.now()}`
  await dialog.getByLabel('助手名称').fill(name)
  const modelField = dialog.locator('label').filter({ hasText: '默认模型' }).locator('..')
  await modelField.getByRole('button').click({ timeout: 30_000 })
  // TimiCC currently leaves gpt-5.6-terra image requests pending until its
  // gateway timeout. Use a model whose visual input was verified directly so
  // this acceptance test measures LinX's multimodal path, not that upstream
  // model-specific outage.
  await expect(dialog.getByText(/gpt-5\.6-sol|GPT-5\.6 Sol/i).first()).toBeVisible({ timeout: 90_000 })
  await dialog.getByPlaceholder('搜索模型...').fill('gpt-5.6-sol')
  await dialog.getByText(/gpt-5\.6-sol|GPT-5\.6 Sol/i).first().click({ timeout: 30_000 })
  await dialog.getByRole('button', { name: /^创建$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 60_000 })
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 60_000 })
}

async function send(chat: ReturnType<Page['frameLocator']>, composer: Locator, message: string): Promise<void> {
  await composer.fill(message)
  await expect(chat.getByRole('button', { name: 'Send message' })).toBeEnabled({ timeout: 60_000 })
  await composer.press('Enter')
}

async function waitForIdle(page: Page): Promise<void> {
  await page.getByRole('button', { name: '停止生成' })
    .waitFor({ state: 'hidden', timeout: 120_000 })
}

async function waitForChatThreadReady(page: Page): Promise<void> {
  await expect(page.getByTestId('chatkit-send-boundary')).toHaveAttribute('data-thread-ready', 'true', {
    timeout: 90_000,
  })
}

async function selectCommand(
  chat: ReturnType<Page['frameLocator']>,
  composer: Locator,
  label: RegExp,
): Promise<void> {
  const command = chat.getByText(label).first()
  // ChatKit snapshots the command list when the slash menu opens. A command
  // that becomes available immediately after a streamed mutation therefore
  // requires reopening the menu so it can observe the refreshed branch state.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await composer.fill('')
    await composer.fill('/')
    if (await command.isVisible().catch(() => false)) {
      // ChatKit command results live inside a shadow-rooted iframe. Headless
      // Chromium can report the iframe document itself as intercepting pointer
      // events even after the unique command is visible and stable.
      await command.click({ force: true, timeout: 30_000 })
      return
    }
    await composer.press('Escape').catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  await expect(command).toBeVisible({ timeout: 30_000 })
}

function createMinimalPdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return new TextEncoder().encode(pdf)
}
