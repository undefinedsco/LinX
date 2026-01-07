import { test, expect } from '@playwright/test';

test('Verify homepage loads correctly', async ({ page }) => {
  // Navigate to the homepage
  await page.goto('http://localhost:5173/');

  // The homepage redirects to /chat and shows a login modal
  // Verify the login modal heading is visible
  await expect(page.getByRole('heading', { name: '登录 LinX' })).toBeVisible();

  // Verify the login provider buttons are visible
  await expect(page.getByRole('button', { name: /sealosgzg/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /localhost/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '使用其他 Pod URL' })).toBeVisible();
});
