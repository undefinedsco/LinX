import { expect, test } from '@playwright/test'
import { expectLoginDialog, fillCustomLoginProvider, getLoginDialog } from '../helpers/login-ui'

test.describe('Solid authentication entry', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expectLoginDialog(page)
  })

  test('asks where the data should live first', async ({ page }) => {
    const dialog = getLoginDialog(page)
    await expect(dialog.getByRole('heading', { name: '登录 LinX' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /云端空间/ })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '使用其他空间…' })).toBeVisible()
  })

  test('opens the other-space form', async ({ page }) => {
    await fillCustomLoginProvider(page, 'http://localhost:5737')

    const dialog = getLoginDialog(page)
    await expect(dialog.getByRole('heading', { name: '使用其他空间' })).toBeVisible()
    await expect(dialog.getByLabel('空间地址')).toHaveValue('http://localhost:5737')
    await expect(dialog.getByRole('button', { name: '继续' })).toBeEnabled()
  })

  test('returns from the other-space form to the space choices', async ({ page }) => {
    const dialog = getLoginDialog(page)
    await dialog.getByRole('button', { name: '使用其他空间…' }).click()
    await dialog.getByRole('button', { name: '返回' }).click()

    await expect(dialog.getByRole('button', { name: /云端空间/ })).toBeVisible()
  })
})
