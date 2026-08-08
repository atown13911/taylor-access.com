import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src', 'assets');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto('https://taylor-access.com/sms-opt-in', {
  waitUntil: 'networkidle',
  timeout: 60000,
});
await page.waitForTimeout(1500);

const fullPath = join(outDir, 'sms-opt-in-proof.png');
await page.screenshot({ path: fullPath, fullPage: true });
console.log('wrote', fullPath);

const thread = page.locator('.sms-thread');
if (await thread.count()) {
  const threadPath = join(outDir, 'sms-opt-in-thread.png');
  await thread.screenshot({ path: threadPath });
  console.log('wrote', threadPath);
}

const ui = page.locator('.ui-proof');
if (await ui.count()) {
  const uiPath = join(outDir, 'sms-opt-in-profile.png');
  await ui.screenshot({ path: uiPath });
  console.log('wrote', uiPath);
}

await browser.close();
