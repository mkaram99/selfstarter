/*
 * Everything that is not the picture: the controls, the object detection, the
 * installable-app wiring, and whether the shell really works offline.
 *
 *   npm run check
 */
const { start } = require('./server');
const { launch, watch } = require('./browser');

const PORT = 8760;
const results = [];

function expect(label, actual, ok) {
  results.push({ label, actual, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${actual}`);
}

(async () => {
  const server = await start(PORT);
  const browser = await launch();
  const context = await browser.newContext({
    viewport: { width: 430, height: 860 },
    permissions: ['camera'],
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const problems = [];
  watch(page, problems);

  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.click('#begin');
  await page.waitForTimeout(2600);

  // --- the instrument -------------------------------------------------------
  const object = await page.evaluate(() => ({
    found: window.app.segment.stats.found,
    fold: window.app.segment.stats.symmetry,
    plate: window.app.resonance.insideCells,
    ringing: window.app.resonance.envMean > 1e-5
  }));
  expect('object detected', JSON.stringify(object), object.found && object.plate > 0);
  expect('membrane ringing', String(object.ringing), object.ringing);

  // --- controls -------------------------------------------------------------
  await page.mouse.move(215, 430);
  await page.mouse.down();
  await page.mouse.move(140, 300, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const lens = await page.evaluate(() => ({
    u: +window.app.lens.u.toFixed(2), v: +window.app.lens.v.toFixed(2) }));
  expect('lens follows a drag', JSON.stringify(lens), lens.u < 0.45);

  await page.keyboard.press(']');
  await page.waitForTimeout(200);
  const aperture = await page.evaluate(() => window.app.lens.r);
  expect('aperture key + slider stay in sync',
    aperture.toFixed(3) + ' / ' + await page.inputValue('#aperture'),
    Math.abs(aperture - Number(await page.inputValue('#aperture'))) < 1e-6);

  await page.click('#btn-shot');
  await page.waitForTimeout(500);
  const captured = await page.evaluate(() => {
    const sheet = document.getElementById('capture');
    return !!sheet && !sheet.classList.contains('hidden') &&
      document.getElementById('capture-image').src.length > 1000;
  });
  expect('capture sheet shows the frame', String(captured), captured);
  await page.click('#capture-close');

  // --- installable app ------------------------------------------------------
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    const m = await (await fetch(link.href)).json();
    return { name: m.name, display: m.display, icons: m.icons.length };
  });
  expect('manifest', JSON.stringify(manifest),
    !!manifest && manifest.display === 'standalone' && manifest.icons >= 3);

  for (const icon of ['icon.svg', 'icon-32.png', 'icon-180.png',
                      'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    const status = await page.evaluate((u) => fetch(u).then((r) => r.status), icon);
    expect('icon ' + icon, String(status), status === 200);
  }

  const worker = await page.evaluate(() =>
    navigator.serviceWorker.ready.then((r) => !!r.active).catch(() => false));
  expect('service worker active', String(worker), worker);

  // --- offline --------------------------------------------------------------
  await page.waitForTimeout(1200);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const offline = await page.evaluate(() =>
    !!window.app && !!window.QM.layers.get('cymatic'));
  expect('boots with the network cut', String(offline), offline);
  await context.setOffline(false);

  expect('no page errors', problems.length ? problems.join(' | ') : 'none', !problems.length);

  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
