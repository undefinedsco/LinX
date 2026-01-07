import { test, expect } from '@playwright/test';

test.describe('Chat Creation', () => {
  test('new chat button should be visible in sidebar', async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:5173/');
    
    // Verify the new chat button is present in the DOM
    const newChatButton = page.getByRole('button', { name: '新建聊天' });
    await expect(newChatButton).toBeAttached();
  });
});
