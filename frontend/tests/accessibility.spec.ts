import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('ArenaOS Accessibility Compliance Checks', () => {
  test('primary navigation page should contain no detectable accessibility violations', async ({ page }) => {
    // Navigate to local build export pathway or dev server
    // For this test, we assume the server runs on localhost:5173 (Vite default)
    await page.goto('http://localhost:5173/');
    
    // Analyze the page structure using axe-core and verify WCAG tags
    const auditResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
      
    // Assert that the list of detected accessibility violations is empty
    expect(auditResults.violations).toEqual([]);
  });
});
