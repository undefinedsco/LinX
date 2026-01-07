import { test, expect } from '@playwright/test';

test('Verify custom Pod URL input works', async ({ page }) => {
  // Navigate to the homepage
  await page.goto('http://localhost:5173/');

  // Wait for the login modal to appear
  await expect(page.getByRole('heading', { name: '登录 LinX' })).toBeVisible();

  // Click on "使用其他 Pod URL" to show the custom input
  await page.getByRole('button', { name: '使用其他 Pod URL' }).click();

  // Verify a text input field appears for entering custom Pod URL
  // The input field should be visible for entering a custom URL
  await expect(page.getByRole('textbox')).toBeVisible();
});
