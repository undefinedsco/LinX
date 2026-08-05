import { expect, test } from '@playwright/test'
import { assertSeededLoginReady, loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'

test.describe.configure({ mode: 'serial' })

test.describe('Files-standard supporting modules real Pod smoke', () => {
  let runtime: SeededXpodRuntime

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
    runtime = await startSeededXpodRuntime()
  })

  test.afterAll(async () => {
    await runtime?.stop()
  })

  test('persists a Contact and walks Settings and Model Services with keyboard interaction', async ({ page }) => {
    test.setTimeout(180_000)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.setViewportSize({ width: 1440, height: 900 })
    await loginToSeededXpod(page, runtime)

    await page.getByRole('button', { name: '联系人', exact: true }).click()
    await expect(page.locator('[data-applet-id="contacts"]')).toBeVisible({ timeout: 30_000 })
    const contactList = page.getByRole('listbox', { name: '联系人' })
    await expect(contactList).toBeVisible({ timeout: 30_000 })
    const contactOption = contactList.getByRole('option').first()
    await expect(contactOption).toBeVisible({ timeout: 30_000 })
    await contactOption.focus()
    await page.keyboard.press('Enter')
    await expect(contactOption).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('选择联系人查看详情')).toHaveCount(0)

    const agentName = `Pod persistence ${Date.now()}`
    await page.getByRole('button', { name: '添加联系人' }).click()
    await page.getByRole('menuitem', { name: '新建助手' }).click()
    const createAgentDialog = page.getByRole('dialog', { name: '新建助手' })
    await expect(createAgentDialog).toBeVisible()
    await createAgentDialog.getByPlaceholder('给助手起个名字').fill(agentName)
    await createAgentDialog.getByRole('button', { name: '创建', exact: true }).click()
    await expect(createAgentDialog).toHaveCount(0, { timeout: 30_000 })
    await expect(contactList.getByRole('option', { name: new RegExp(agentName) })).toBeVisible({ timeout: 30_000 })

    await page.reload()
    await assertSeededLoginReady(page, runtime)
    await page.getByRole('button', { name: '联系人', exact: true }).click()
    await expect(page.locator('[data-applet-id="contacts"]')).toBeVisible({ timeout: 30_000 })
    await page.getByPlaceholder('搜索联系人').fill(agentName)
    await expect(page.getByRole('listbox', { name: '联系人' }).getByRole('option', { name: new RegExp(agentName) }))
      .toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('menuitem', { name: '通用设置' }).click()
    await expect(page.locator('[data-applet-id="settings"]')).toBeVisible({ timeout: 30_000 })
    const settingsNavigation = page.getByRole('navigation', { name: '设置分类' })
    await settingsNavigation.getByRole('button', { name: /本地网络/ }).click()
    const advancedNetwork = page.getByRole('button', { name: '高级网络设置' })
    await expect(advancedNetwork).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByLabel('自有公网域名（可选）')).toHaveCount(0)
    await advancedNetwork.focus()
    await page.keyboard.press('Enter')
    await expect(advancedNetwork).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByLabel('自有公网域名（可选）')).toBeVisible()
    await expect(page.getByLabel('Cloudflare Tunnel token（可选）')).toBeVisible()

    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('menuitem', { name: '模型服务' }).click()
    await expect(page.locator('[data-applet-id="model-services"]')).toBeVisible({ timeout: 30_000 })
    const providerList = page.getByRole('listbox', { name: '模型提供商' })
    await expect(providerList).toBeVisible({ timeout: 30_000 })
    const providerOption = providerList.getByRole('option').first()
    await expect(providerOption).toBeVisible()
    await providerOption.focus()
    await page.keyboard.press('Enter')
    await expect(providerOption).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('switch', { name: '启用提供商' })).toBeVisible()

    expect(pageErrors).toEqual([])
  })
})
