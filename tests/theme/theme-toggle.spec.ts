import { test, expect } from '@playwright/test';

test.describe('Theme Toggle', () => {
  test('theme toggle button should be present in the UI', async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:5173/');
    
    // Verify the theme toggle button is present (it toggles between light/dark mode)
    // The button text indicates the mode it will switch to
    const darkModeButton = page.getByRole('button', { name: '切换到深色模式' });
    const lightModeButton = page.getByRole('button', { name: '切换到浅色模式' });
    
    // Either dark mode or light mode button should be present depending on current theme
    const hasDarkModeButton = await darkModeButton.isVisible();
    const hasLightModeButton = await lightModeButton.isVisible();
    
    expect(hasDarkModeButton || hasLightModeButton).toBeTruthy();
  });
});
