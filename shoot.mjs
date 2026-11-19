// Leonida Ledger screenshot runner (Node 22, standard library + playwright-core).
// Serves app/ on a free localhost port, renders the four views from shots.json
// in Chromium at 1280x800, and saves JPEGs to screenshots/. It also records
// every network request the page makes and fails if any leaves this server,
// and it exercises the tracker (check, reload, filter, spoiler toggle) in a
// separate browser context to prove progress really persists.
//
// Usage: node shoot.mjs   (run from the repository root)

import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, extname, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const appDir = join(repoRoot, 'app');
const shotsDir = join(repoRoot, 'screenshots');
const shots = JSON.parse(await readFile(join(repoRoot, 'shots.json'), 'utf8'));

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(join(appDir, decodeURIComponent(url.pathname)));
    if (!path.startsWith(appDir)) { res.writeHead(403); res.end(); return; }
    let info = await stat(path).catch(() => null);
    if (info?.isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (_) {
    res.writeHead(404);
    res.end('not found');
  }
});

// Bind a free port starting at 8126 (8123 may be held by a sibling entry).
let port = 8126;
while (true) {
  try {
    await new Promise((ok, bad) => {
      server.once('error', bad);
      server.listen(port, '127.0.0.1', ok);
    });
    break;
  } catch (_) {
    port += 1;
    if (port > 8150) throw new Error('no free port');
  }
}
console.log(`serving app/ on http://127.0.0.1:${port}`);

const executablePath = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });

const externalRequests = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
context.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith(`http://127.0.0.1:${port}`) && !url.startsWith('data:') && url !== 'about:blank') {
    externalRequests.push(url);
  }
});
const page = await context.newPage();
page.on('pageerror', (err) => console.log('PAGE ERROR:', String(err)));
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

await mkdir(shotsDir, { recursive: true });
for (const shot of shots) {
  await page.goto(`http://127.0.0.1:${port}${shot.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  if (shot.scroll) await page.evaluate((y) => window.scrollTo(0, y), shot.scroll);
  await page.waitForTimeout(200);
  const out = join(shotsDir, shot.file);
  await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
  const info = await stat(out);
  console.log(`${shot.file}: ${(info.size / 1024).toFixed(1)} KiB — ${shot.note}`);
}

// Functional check in a fresh context: check a box, reload, confirm it stuck;
// flip the spoiler switch and the kind filter and confirm the list changes.
const test = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const tpage = await test.newPage();
await tpage.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
await tpage.waitForTimeout(300);
const before = await tpage.evaluate(() => document.querySelectorAll('.trophy-card').length);
await tpage.evaluate(() => {
  document.querySelector('.trophy-card input[type="checkbox"]').click();
});
await tpage.waitForTimeout(200);
const saved = await tpage.evaluate(() => JSON.parse(localStorage.getItem('leonida-ledger-earned-v1') ?? '[]').length);
await tpage.reload({ waitUntil: 'networkidle' });
await tpage.waitForTimeout(300);
const afterReload = await tpage.evaluate(() => document.querySelector('.trophy-card.earned') !== null);
await tpage.evaluate(() => {
  document.getElementById('kindFilter').value = 'missable';
  document.getElementById('kindFilter').dispatchEvent(new Event('change'));
});
await tpage.waitForTimeout(200);
const missableShown = await tpage.evaluate(() => document.querySelectorAll('.trophy-card').length);
await tpage.evaluate(() => {
  document.getElementById('kindFilter').value = 'all';
  document.getElementById('kindFilter').dispatchEvent(new Event('change'));
});
await tpage.waitForTimeout(200);
await tpage.evaluate(() => {
  document.getElementById('spoilerToggle').click();
});
await tpage.waitForTimeout(200);
const masked = await tpage.evaluate(() => document.querySelectorAll('.spoiler-mask').length);
console.log(`tracker check: ${before} cards listed, ${saved} saved after tick, persists after reload: ${afterReload}, missable filter shows ${missableShown}, spoiler masks ${masked} story trophies`);
console.log('external requests:', externalRequests.length ? externalRequests : 'none');
if (externalRequests.length) process.exitCode = 1;

await browser.close();
server.close();
const files = (await readdir(shotsDir)).sort();
console.log('screenshots:', files.join(', '));
