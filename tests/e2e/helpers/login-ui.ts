import { expect, type Page } from '@playwright/test'

const LOGIN_DIALOG_NAME = '登录 LinX'

export function getLoginDialog(page: Page) {
  return page.getByRole('dialog', { name: LOGIN_DIALOG_NAME })
}

export async function expectLoginDialog(page: Page): Promise<void> {
  await expect(getLoginDialog(page)).toBeVisible({ timeout: 15_000 })
}

export async function expectLoginComplete(page: Page): Promise<void> {
  await expect(getLoginDialog(page)).toHaveCount(0)
}

export async function openLoginMethods(page: Page): Promise<void> {
  // R6: the first screen already lists the three spaces; nothing to expand.
  await expect(getLoginDialog(page)).toBeVisible({ timeout: 15_000 })
}

export async function selectLoginSpace(page: Page, space: 'cloud' | 'local'): Promise<void> {
  await openLoginMethods(page)
  const label = space === 'cloud' ? '云端空间' : '本机空间'
  await getLoginDialog(page).getByRole('button', { name: new RegExp(label) }).first().click()
}

export async function fillCustomLoginProvider(page: Page, providerUrl: string): Promise<void> {
  const dialog = getLoginDialog(page)
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await dialog.getByRole('button', { name: '使用其他空间…' }).click()
  await dialog.getByLabel('空间地址').fill(providerUrl)
}
