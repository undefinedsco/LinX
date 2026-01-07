import { test, expect } from '@playwright/test';

test.describe('Login Modal', () => {
  test('login modal should display with correct elements when user is not logged in', async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:5173/');
    
    // Verify login modal heading is visible
    await expect(page.getByRole('heading', { name: '登录 LinX' })).toBeVisible();
    
    // Verify the Use Other Pod URL button is visible
    await expect(page.getByRole('button', { name: '使用其他 Pod URL' })).toBeVisible();
    
    // Verify the Return to current account button is visible
    await expect(page.getByRole('button', { name: '返回当前账号' })).toBeVisible();
  });

  test('custom Pod URL input should appear when clicking Use Other Pod URL button', async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:5173/');
    
    // Click on Use Other Pod URL button
    await page.getByRole('button', { name: '使用其他 Pod URL' }).click();
    
    // Verify the textbox for custom Pod URL appears
    const podUrlTextbox = page.getByRole('textbox', { name: 'https://my-pod.example.com' });
    await expect(podUrlTextbox).toBeVisible();
    
    // Verify Cancel button is visible
    await expect(page.getByRole('button', { name: '取消' })).toBeVisible();
  });

  test('confirm button should be enabled after entering a valid URL', async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:5173/');
    
    // Click on Use Other Pod URL button
    await page.getByRole('button', { name: '使用其他 Pod URL' }).click();
    
    // Verify the confirm button is initially disabled
    const confirmButton = page.getByRole('button', { name: '确定' });
    await expect(confirmButton).toBeDisabled();
    
    // Type a URL in the Pod URL textbox
    await page.getByRole('textbox', { name: 'https://my-pod.example.com' }).fill('https://example.com');
    
    // Verify the confirm button is now enabled
    await expect(confirmButton).toBeEnabled();
  });
});
