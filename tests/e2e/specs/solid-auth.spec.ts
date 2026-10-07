import { expect, test } from '@playwright/test'
import { expectLoginDialog, fillCustomLoginProvider, getLoginDialog, openLoginMethods } from '../helpers/login-ui'

test.describe('Solid authentication entry', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expectLoginDialog(page)
  })

  test('shows the current compact login surface', async ({ page }) => {
    const dialog = getLoginDialog(page)
    await expect(dialog.getByRole('heading', { name: 'LinX' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '登录', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '更多选项' })).toBeVisible()
  })

  test('opens the current custom Solid provider form', async ({ page }) => {
    await fillCustomLoginProvider(page, 'http://localhost:5737')

    const dialog = getLoginDialog(page)
    await expect(dialog.getByRole('heading', { name: '更多选项' })).toBeVisible()
    await expect(dialog.getByLabel('登录方式地址')).toHaveValue('http://localhost:5737')
    await expect(dialog.getByRole('button', { name: '连接' })).toBeEnabled()
  })

  test('returns from login methods to the main login surface', async ({ page }) => {
    await openLoginMethods(page)
    await getLoginDialog(page).getByRole('button', { name: '返回' }).click()

    await expect(getLoginDialog(page).getByRole('button', { name: '登录', exact: true })).toBeVisible()
  })
})
