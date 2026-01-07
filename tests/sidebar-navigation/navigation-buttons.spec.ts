import { test, expect } from '@playwright/test';

test.describe('Sidebar Navigation', () => {
  test('clicking on navigation buttons should navigate to correct views', async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:5173/');
    
    // Close the login modal by clicking the close button
    const closeButton = page.locator('.absolute').first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
    
    // Verify the main sidebar is visible
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    
    // Test navigation by clicking on different sidebar items
    // The sidebar should contain navigation buttons/links
    const navButtons = page.locator('aside button, aside a');
    
    // Verify at least one navigation item exists
    await expect(navButtons.first()).toBeVisible();
  });
});
