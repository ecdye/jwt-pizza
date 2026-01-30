import { test, expect } from 'playwright-test-coverage';

test('main page', async ({ page }) => {
  await page.goto('http://localhost:5173/');
});
