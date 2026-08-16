import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src', 'assets');
mkdirSync(outDir, { recursive: true });

const target = process.env.SMS_OPT_IN_URL || 'https://taylor-access.com/sms-opt-in';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 1600 },
  deviceScaleFactor: 2,
});
await page.goto(target, {
  waitUntil: 'networkidle',
  timeout: 60000,
});
await page.waitForSelector('.brand-header');
await page.waitForTimeout(800);

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
