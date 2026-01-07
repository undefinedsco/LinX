import { test, expect } from '@playwright/test';

test.describe('Parity smoke suite', () => {
  test('web shell renders welcome page', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: 'Welcome to Linq' })).toBeVisible();
  });
});
