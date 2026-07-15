const db = require('./db');

function serializePhoto(photo) {
  const tags = db
    .prepare(
      `SELECT t.name FROM tags t
       JOIN photo_tags pt ON pt.tag_id = t.id
       WHERE pt.photo_id = ?
       ORDER BY t.name COLLATE NOCASE`
    )
    .all(photo.id)
    .map((r) => r.name);

  const albums = db
    .prepare(
      `SELECT a.id, a.name FROM albums a
       JOIN album_photos ap ON ap.album_id = a.id
       WHERE ap.photo_id = ?
       ORDER BY a.name COLLATE NOCASE`
    )
    .all(photo.id);

  return {
    id: photo.id,
    filename: photo.filename,
    originalName: photo.original_name,
    mimeType: photo.mime_type,
    size: photo.size,
    width: photo.width,
    height: photo.height,
    takenAt: photo.taken_at,
    uploadedAt: photo.uploaded_at,
    favorite: !!photo.favorite,
    description: photo.description,
    scannedAt: photo.scanned_at,
    scanError: photo.scan_error,
    tags,
    albums,
    url: `/storage/${photo.filename}`,
    thumbUrl: `/thumbs/${photo.filename}`,
  };
}

function getOrCreateTag(name) {
  const clean = name.trim().toLowerCase();
  if (!clean) return null;
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(clean);
  return db.prepare('SELECT * FROM tags WHERE name = ?').get(clean);
}

module.exports = { serializePhoto, getOrCreateTag };
