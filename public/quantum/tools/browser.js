/*
 * Chromium, with a fake camera so the tests have a moving scene to read.
 * PLAYWRIGHT_CHROMIUM overrides the executable when the sandbox ships its own.
 */
const { chromium } = require('playwright');

const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM || undefined;

function launch() {
  return chromium.launch({
    executablePath: EXECUTABLE,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--no-sandbox'
    ]
  });
}

/* Collect anything the page complains about, so a test can assert on it. */
function watch(page, sink) {
  page.on('pageerror', (e) => sink.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) {
      sink.push('console: ' + m.text());
    }
  });
}

module.exports = { launch, watch };
