import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { resolve } from 'node:path';
const server = await preview({ configFile: resolve('vite.ui-test.config.ts'), preview: { host: '127.0.0.1', port: 4179, strictPort: true } });
const browser = await chromium.launch();
let failed = false;
try {
  for (const [scene, selector] of [['performance-history', '[data-commit-hash]'], ['performance', 'text=file-0000.txt']]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(`http://127.0.0.1:4179/?scene=${scene}`);
    const row = page.locator(selector).first();
    await row.waitFor();
    await row.click({ button: 'right' });
    const menu = page.locator('[data-slot="context-menu-content"], [role="menu"]').first();
    try {
      await menu.waitFor({ state: 'visible', timeout: 4000 });
      console.log(`${scene}: context menu opened on first right-click, ${await menu.locator('[role="menuitem"]').count()} items`);
    } catch {
      failed = true;
      console.log(`${scene}: FAILED — no context menu after first right-click`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(r => server.httpServer.close(r));
}
process.exit(failed ? 1 : 0);
