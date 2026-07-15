const path = require('path');
const sharp = require('sharp');

const db = require('./db');
const { getApiKey, getModel } = require('./settings');
const { describeImage } = require('./anthropicVision');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const DESCRIBE_BATCH_SIZE = 5;

const getUnscanned = db.prepare(
  `SELECT id, filename FROM photos WHERE description IS NULL AND scan_error IS NULL ORDER BY uploaded_at DESC LIMIT ?`
);
const setDescriptionStmt = db.prepare(
  `UPDATE photos SET description = ?, scanned_at = datetime('now'), scan_error = NULL WHERE id = ?`
);
const setErrorStmt = db.prepare(`UPDATE photos SET scan_error = ? WHERE id = ?`);
const clearErrorsStmt = db.prepare(`UPDATE photos SET scan_error = NULL WHERE scan_error IS NOT NULL`);
const statsStmt = db.prepare(`
  SELECT COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN description IS NOT NULL THEN 1 ELSE 0 END), 0) AS scanned,
    COALESCE(SUM(CASE WHEN scan_error IS NOT NULL THEN 1 ELSE 0 END), 0) AS errored
  FROM photos
`);

// `scanned`/`errors` counts always come from the DB (statsStmt below), not in-memory
// counters, so status stays correct across server restarts. Only `status` and
// `lastError` are session-only signals that reset when the process restarts.
const state = {
  status: 'idle', // idle | scanning | paused | done | error
  lastError: null,
};
let pausedFlag = false;
let runningFlag = false;

// Always normalizes to JPEG before sending, regardless of the original's format
// (PNG/GIF/HEIC), since that's the one format guaranteed to be accepted by the vision API.
async function describeOnePhoto(id, filename, apiKey, model) {
  const filePath = path.join(STORAGE_DIR, filename);
  const buffer = await sharp(filePath, { failOn: 'none' })
    .rotate()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  const description = await describeImage({
    apiKey,
    model,
    base64: buffer.toString('base64'),
    mediaType: 'image/jpeg',
  });
  setDescriptionStmt.run(description, id);
  return description;
}

async function runScan() {
  if (runningFlag) return;
  runningFlag = true;
  pausedFlag = false;
  state.status = 'scanning';
  state.lastError = null;

  const apiKey = getApiKey();
  const model = getModel();
  if (!apiKey) {
    state.status = 'error';
    state.lastError = 'Add an Anthropic API key in Settings before scanning.';
    runningFlag = false;
    return;
  }

  try {
    for (;;) {
      if (pausedFlag) {
        state.status = 'paused';
        break;
      }
      const rows = getUnscanned.all(DESCRIBE_BATCH_SIZE);
      if (rows.length === 0) {
        state.status = 'done';
        break;
      }

      for (const row of rows) {
        if (pausedFlag) {
          state.status = 'paused';
          break;
        }
        try {
          await describeOnePhoto(row.id, row.filename, apiKey, model);
        } catch (err) {
          setErrorStmt.run(String(err.message || err).slice(0, 500), row.id);
        }
      }
    }
  } catch (err) {
    state.status = 'error';
    state.lastError = String(err.message || err);
  } finally {
    runningFlag = false;
  }
}

function start() {
  runScan(); // fire-and-forget; progress is polled via getStatus()
  return getStatus();
}

function pause() {
  pausedFlag = true;
  if (state.status === 'scanning') state.status = 'paused';
}

function getStatus() {
  const stats = statsStmt.get();
  return { ...state, scanned: stats.scanned, errors: stats.errored, total: stats.total };
}

function retryErrors() {
  clearErrorsStmt.run();
  return start();
}

module.exports = { start, pause, getStatus, retryErrors, describeOnePhoto };
