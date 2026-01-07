import { test, expect } from '@playwright/test';

test('Verify login modal shows provider options', async ({ page }) => {
  // Navigate to the homepage
  await page.goto('http://localhost:5173/');

  // Verify the login modal heading is visible
  await expect(page.getByRole('heading', { name: '登录 LinX' })).toBeVisible();

  // Verify the sealosgzg provider button is visible
  await expect(page.getByRole('button', { name: /sealosgzg/ })).toBeVisible();

  // Verify the localhost provider button is visible
  await expect(page.getByRole('button', { name: /localhost/ })).toBeVisible();

  // Verify the "使用其他 Pod URL" button is visible for custom provider
  await expect(page.getByRole('button', { name: '使用其他 Pod URL' })).toBeVisible();

  // Verify the "返回当前账号" button is visible
  await expect(page.getByRole('button', { name: '返回当前账号' })).toBeVisible();
});
