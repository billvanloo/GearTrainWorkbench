// End-to-end checks for the canvas/DOM behaviour the pure-module tests cannot
// reach, driven in headless Chromium against the real index.html. Covers the
// 2026-09-22 student bug reports: the train staying on a shrinking sheet
// (off-sheet markers + readout note), per-challenge boards (isolation, undo,
// persistence across a refresh), the GIVEN attach step, the report image being
// decoded before print(), and a period-free print filename.
//
// Unlike the other dev/ tests this needs Playwright (not a project dependency):
//   npm i --no-save playwright && npx playwright install chromium   (once, repo root)
//   cd dev && node e2e.js [screenshot.png]
// Set CHROMIUM_PATH to use an already-installed Chromium instead.
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('Playwright not found. From the repo root, once: npm i --no-save playwright && npx playwright install chromium'); process.exit(2); }

// Serve the repo root so localStorage has a stable http origin.
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 950 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.waitForTimeout(200);

  // Build a 12->24 mesh (motor/load attached) near the right edge of challenge 1.1
  const build = () => page.evaluate(() => {
    const x = CW - 120, y = 300;
    const a = placeGearAt(12, { x, y });
    const b = placeGearAt(24, { x: 0, y: 0 }, computeSnap({ id: 'tmp', teeth: 24, shaftId: 'tmp', layer: 0 }, { x: x + 81, y }));
    S.motor = { shaftId: a.shaftId }; S.load = { shaftId: b.shaftId }; resolve();
    return { CW, n: S.gears.length, ratio: solved.ratioText, xs: S.shafts.map(s => s.x) };
  });

  // ---- item 3, trigger 1: challenge panel narrows the sheet
  await page.evaluate(() => { setMode('challenge'); openChallenge('1.1'); });
  await page.waitForTimeout(100);
  const b0 = await build();
  ok('built 1.1 train', b0.n === 2 && b0.ratio && !/undefined/.test(b0.ratio), b0);
  // ---- item 3, trigger 2: window shrinks
  await page.setViewportSize({ width: 900, height: 950 }); await page.waitForTimeout(300);
  const r1 = await page.evaluate(() => ({ CW, off: offSheetShafts(S.shafts, CW, CH).length, xs: S.shafts.map(s => s.x), ok: solved.ok, err: solved.error, ratio: solved.ratioText,
    inside: S.gears.every(g => { const s = shaftById(g.shaftId); return s.x + pitchRadius(g.teeth) <= CW + 1e-6 && s.x - pitchRadius(g.teeth) >= -1e-6; }) }));
  ok('after shrink: nothing off sheet', r1.off === 0 && r1.inside, r1);
  ok('after shrink: mesh intact (still solves, same ratio)', r1.ok && !r1.err && r1.ratio === b0.ratio, r1);

  // ---- item 2: per-challenge boards
  await page.evaluate(() => openChallenge('2.2'));
  const r2 = await page.evaluate(() => ({ n: S.gears.length, motor: S.motor, load: S.load, err: solved && solved.error }));
  ok('2.2 opens on an empty board', r2.n === 0 && !r2.motor && !r2.load, r2);
  await page.evaluate(() => undo());
  ok('undo on 2.2 does not pull in 1.1 gears', (await page.evaluate(() => S.gears.length)) === 0);
  await page.evaluate(() => openChallenge('1.1'));
  const r3 = await page.evaluate(() => ({ teeth: S.gears.map(g => g.teeth), m: !!S.motor, l: !!S.load, ratio: solved.ratioText }));
  ok('back to 1.1 restores its board', JSON.stringify(r3.teeth) === '[12,24]' && r3.m && r3.l && r3.ratio === b0.ratio, r3);
  await page.evaluate(() => setMode('sandbox'));
  ok('sandbox has its own (empty) board', (await page.evaluate(() => S.gears.length)) === 0);
  await page.evaluate(() => { placeGearAt(40, { x: 200, y: 200 }); });
  await page.waitForTimeout(600); // debounce save
  await page.reload(); await page.waitForTimeout(300);
  const r4 = await page.evaluate(() => ({ sandbox: S.gears.map(g => g.teeth) }));
  ok('sandbox board survives refresh', JSON.stringify(r4.sandbox) === '[40]', r4);
  await page.evaluate(() => { setMode('challenge'); openChallenge('1.1'); });
  const r5 = await page.evaluate(() => ({ teeth: S.gears.map(g => g.teeth), ids: S.gears.map(g => g.id), idc: S.idc }));
  ok('1.1 board survives refresh', JSON.stringify(r5.teeth) === '[12,24]', r5);
  const r5b = await page.evaluate(() => { const g = placeGearAt(12, { x: 100, y: 600 }); const ids = S.gears.map(x => x.id); removeGear(g.id); resolve(); return ids; });
  ok('new ids do not collide after restore', new Set(r5b).size === r5b.length, r5b);

  // ---- item 1: GIVEN block + 1.1 wording
  const given = await page.evaluate(() => document.querySelector('#chDetail .given').textContent + ' | ' + document.querySelector('#chDetail .scenario').textContent);
  ok('GIVEN states the attach step', /Attach: Motor to the input gear · Load to the output gear/.test(given), given);
  ok('1.1 names where motor and load go', /motor to the 12T and the load to the 24T/.test(given), given);

  // ---- items 4 + 5: print timing and filename
  await page.evaluate(() => { openChallenge('2.2'); window.print = () => { const i = document.querySelector('#report img'); window.__p = { complete: i.complete, w: i.naturalWidth, title: document.title }; }; });
  await page.click('#btnReport'); await page.waitForTimeout(300);
  const p = await page.evaluate(() => window.__p);
  ok('image decoded before print()', p && p.complete && p.w > 0, p);
  ok('print title has no period', p && p.title.indexOf('.') === -1 && /challenge-2-2/.test(p.title), p);

  // ---- item 3, surface the leftover: train too big for the sheet
  await page.evaluate(() => { setMode('sandbox'); clearAll(); let x = 100; let prev = placeGearAt(60, { x, y: 300 });
    for (let i = 0; i < 5; i++) { const s = shaftById(prev.shaftId); prev = placeGearAt(60, { x: 0, y: 0 }, computeSnap({ id: 't', teeth: 60, shaftId: 't', layer: 0 }, { x: s.x + 270, y: 300 })) || prev; }
    S.motor = { shaftId: S.shafts[0].id }; resolve(); });
  await page.setViewportSize({ width: 700, height: 950 }); await page.waitForTimeout(400);
  const r6 = await page.evaluate(() => ({ off: offSheetShafts(S.shafts, CW, CH).length, msg: document.getElementById('droMsg').textContent, toast: document.getElementById('toast').textContent }));
  ok('oversized train: off-sheet reported in readout', r6.off > 0 && /off the edge of the sheet/.test(r6.msg), r6);
  ok('oversized train: toast explains', /too small/.test(r6.toast), r6);
  ok('toast and readout agree', r6.toast.indexOf(r6.off+' shaft')>=0 && r6.msg.indexOf(r6.off+' shaft')>=0, r6);
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] });

  ok('no page errors', errs.length === 0, errs);
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
