import type { Page } from '@playwright/test';

/** Open a tab of the fixed-viewport layout (plan T2.7); controls on other tabs are not in the DOM. */
export async function showTab(page: Page, name: 'Sound' | 'Shape' | 'Modulation' | 'Effects' | 'Composition') {
  await page.getByRole('tab', { name, exact: true }).click();
}
