/*
 * Walk the whole dial. For each rung: screenshot, dump the readout, measure
 * the frame rate, and fail on anything the page logged.
 *
 *   npm run smoke            all nine rungs into tools/shots/
 *   npm run smoke -- 4 5     just those rungs
 */
const fs = require('fs');
const path = require('path');
const { start } = require('./server');
const { launch, watch } = require('./browser');

const PORT = 8731;
const SHOTS = path.join(__dirname, 'shots');
const NAMES = ['ambient', 'radiant', 'cellular', 'wavefront', 'molecular',
               'atomic', 'nuclear', 'partonic', 'vacuum'];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await start(PORT);
  const browser = await launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['camera'],
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const problems = [];
  watch(page, problems);

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.click('#begin');
  await page.waitForTimeout(2500);
  console.log('source:', await page.textContent('#sourcelabel'));

  const wanted = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
  const rungs = wanted.length ? wanted : NAMES.map((_, i) => i);

  for (const i of rungs) {
    await page.evaluate((r) => {
      window.app.setTarget(r);
      window.app.position = r;
    }, i);
    // The membrane needs a moment to settle into a standing pattern.
    await page.waitForTimeout(2200);

    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      (function tick() {
        if (++n < 45) return requestAnimationFrame(tick);
        res((n / ((performance.now() - t0) / 1000)).toFixed(1));
      })();
    }));

    const readout = await page.evaluate(() => ({
      regime: document.getElementById('regime-name').textContent,
      mag: document.getElementById('mag-badge').textContent,
      quality: window.app.quality.toFixed(2),
      rows: [...document.querySelectorAll('.readout-row')].map((r) =>
        r.querySelector('.readout-label').textContent + ' = ' +
        r.querySelector('.readout-value b').textContent)
    }));

    console.log(`\n[${i}] ${readout.regime}  ${readout.mag}  ${fps} fps  q=${readout.quality}`);
    console.log('    ' + readout.rows.join('\n    '));
    await page.screenshot({ path: path.join(SHOTS, `${i}-${NAMES[i]}.png`) });
  }

  console.log('\nscreenshots →', SHOTS);
  console.log('problems:', problems.length ? '\n  ' + problems.join('\n  ') : 'none');

  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
