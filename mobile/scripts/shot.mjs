import { chromium } from 'playwright';
const [,, route = '/', out = '/tmp/shot.png', wait = '9000'] = process.argv;
const base = process.env.SHOT_BASE ?? 'http://localhost:8090';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, colorScheme: 'dark' });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => (m.type() === 'error' ? console.log('[console]', m.text().slice(0, 300)) : null));
await page.goto(base + route, { waitUntil: 'load', timeout: 180000 });
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
