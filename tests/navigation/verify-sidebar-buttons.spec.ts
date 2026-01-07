import { test, expect } from '@playwright/test';

test('Verify sidebar navigation buttons are visible', async ({ page }) => {
  // Navigate to the homepage
  await page.goto('http://localhost:5173/');

  // Verify the main navigation buttons in the sidebar are visible
  // Chat button (using exact match to avoid matching "新建聊天")
  await expect(page.getByRole('button', { name: '聊天', exact: true })).toBeVisible();

  // Contacts button  
  await expect(page.getByRole('button', { name: '联系人' })).toBeVisible();

  // Files button
  await expect(page.getByRole('button', { name: '文件' })).toBeVisible();

  // Favorites button
  await expect(page.getByRole('button', { name: '收藏' })).toBeVisible();

  // Import button
  await expect(page.getByRole('button', { name: '导入' })).toBeVisible();

  // Settings button
  await expect(page.getByRole('button', { name: '设置' })).toBeVisible();
});
