import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-media-library';

let db = null;

export function getDb() {
  if (!db) {
    db = SQLite.openDatabaseSync('photos.db');
    db.execSync(`
      CREATE TABLE IF NOT EXISTS photos (
        asset_id TEXT PRIMARY KEY,
        uri TEXT,
        filename TEXT,
        width INTEGER,
        height INTEGER,
        creation_time INTEGER,
        favorite INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        scanned_at TEXT,
        scan_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_photos_creation_time ON photos(creation_time);
      CREATE INDEX IF NOT EXISTS idx_photos_description ON photos(description);
    `);
  }
  return db;
}

// `asset` is the lightweight AssetMetadata shape from Query.exeForMetadata() —
// deliberately does not include `uri`, which is resolved lazily via ensureUri().
export function upsertPhotoStub(db, asset) {
  db.runSync(
    `INSERT INTO photos (asset_id, filename, width, height, creation_time, favorite)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset_id) DO UPDATE SET
       filename = excluded.filename,
       width = excluded.width,
       height = excluded.height,
       favorite = excluded.favorite`,
    [
      asset.id,
      asset.filename ?? null,
      asset.width ?? null,
      asset.height ?? null,
      asset.creationTime ?? 0,
      asset.isFavorite ? 1 : 0,
    ]
  );
}

// Ensures a row exists for an asset the user opened directly from a live MediaLibrary
// browse (Library tab) before any indexing pass has reached it.
export function ensureStubRow(db, assetId) {
  db.runSync(`INSERT OR IGNORE INTO photos (asset_id, creation_time, favorite) VALUES (?, 0, 0)`, [assetId]);
}

// Resolves and caches an asset's file URI, which expo-media-library's cheap
// metadata query does not provide. Safe to call repeatedly — cached after first resolve.
export async function ensureUri(db, assetId) {
  const row = db.getFirstSync(`SELECT uri FROM photos WHERE asset_id = ?`, [assetId]);
  if (row?.uri) return row.uri;
  const uri = await new Asset(assetId).getUri();
  db.runSync(`UPDATE photos SET uri = ? WHERE asset_id = ?`, [uri, assetId]);
  return uri;
}

export function setDescription(db, assetId, description) {
  db.runSync(
    `UPDATE photos SET description = ?, scanned_at = datetime('now'), scan_error = NULL WHERE asset_id = ?`,
    [description, assetId]
  );
}

export function setScanError(db, assetId, message) {
  db.runSync(`UPDATE photos SET scan_error = ? WHERE asset_id = ?`, [String(message).slice(0, 500), assetId]);
}

export function clearScanErrors(db) {
  db.runSync(`UPDATE photos SET scan_error = NULL WHERE scan_error IS NOT NULL`);
}

export function getUnscanned(db, limit) {
  return db.getAllSync(
    `SELECT asset_id, uri FROM photos WHERE description IS NULL AND scan_error IS NULL ORDER BY creation_time DESC LIMIT ?`,
    [limit]
  );
}

export function getStats(db) {
  return db.getFirstSync(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN description IS NOT NULL THEN 1 ELSE 0 END), 0) AS scanned,
       COALESCE(SUM(CASE WHEN scan_error IS NOT NULL THEN 1 ELSE 0 END), 0) AS errored
     FROM photos`
  );
}

export function searchPhotos(db, query) {
  const like = `%${query.trim()}%`;
  return db.getAllSync(
    `SELECT * FROM photos WHERE description LIKE ? OR filename LIKE ? ORDER BY creation_time DESC LIMIT 300`,
    [like, like]
  );
}

export function getPhoto(db, assetId) {
  return db.getFirstSync(`SELECT * FROM photos WHERE asset_id = ?`, [assetId]);
}

export function updatePhotoDescriptionManual(db, assetId, description) {
  db.runSync(`UPDATE photos SET description = ?, scanned_at = datetime('now') WHERE asset_id = ?`, [
    description,
    assetId,
  ]);
}

export function resetLibrary(db) {
  db.execSync(`DELETE FROM photos;`);
}
