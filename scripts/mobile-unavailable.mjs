import { chromium, devices } from 'playwright';
import { mobileDiagnostics } from './mobile-checks.mjs';
import assert from 'node:assert/strict';

export async function unavailableCheck(url) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(devices['Pixel 7']);
    await page.addInitScript(mobileDiagnostics, { unavailable: true });
    await page.goto(url);
    const button = page.getByRole('button', { name: 'Tap to reload the studio', exact: true });
    await button.waitFor({ timeout: 5000 });
    assert(await button.isVisible());
    assert.equal(await page.locator('.opening').count(), 0, 'Fallback must replace the opening screen');
    const box = await button.boundingBox();
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= devices['Pixel 7'].viewport.width);
    await page.screenshot({ path: 'screenshots/mobile-webgl-unavailable.png' });
    // The reload control must be operable, not hidden behind the opening layer.
    await Promise.all([page.waitForEvent('domcontentloaded'), button.tap()]);
    await page.getByRole('button', { name: 'Tap to reload the studio', exact: true }).waitFor({ timeout: 5000 });
    return { status: 'passed', reloadWorks: true };
  } finally { await browser.close(); }
}
if (process.argv[1]?.endsWith('/mobile-unavailable.mjs')) console.log(await unavailableCheck(process.env.MOBILE_URL ?? 'http://127.0.0.1:4173'));
