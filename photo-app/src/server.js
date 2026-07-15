const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const exifr = require('exifr');

const db = require('./db');
const { serializePhoto, getOrCreateTag } = require('./repo');
const settings = require('./settings');
const scanner = require('./scanner');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const THUMB_DIR = path.join(__dirname, '..', 'storage', '_thumbs');
fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(THUMB_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, STORAGE_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/storage', express.static(STORAGE_DIR, { index: false, dotfiles: 'deny' }));
app.use('/thumbs', express.static(THUMB_DIR, { index: false, dotfiles: 'deny' }));

const insertPhoto = db.prepare(`
  INSERT INTO photos (filename, original_name, mime_type, size, width, height, taken_at)
  VALUES (@filename, @original_name, @mime_type, @size, @width, @height, @taken_at)
`);
const getPhotoById = db.prepare('SELECT * FROM photos WHERE id = ?');
const deletePhotoStmt = db.prepare('DELETE FROM photos WHERE id = ?');
const setFavoriteStmt = db.prepare('UPDATE photos SET favorite = ? WHERE id = ?');
const setDescriptionManualStmt = db.prepare(
  `UPDATE photos SET description = ?, scanned_at = datetime('now') WHERE id = ?`
);
const linkTag = db.prepare('INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)');
const unlinkTagByName = db.prepare(`
  DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)
`);
const pruneOrphanTags = db.prepare(`
  DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM photo_tags)
`);

// ---- Photos ----

app.post('/api/photos', upload.array('photos', 30), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

  const created = [];
  for (const file of files) {
    try {
      const filePath = path.join(STORAGE_DIR, file.filename);
      const thumbPath = path.join(THUMB_DIR, file.filename);

      const image = sharp(filePath, { failOn: 'none' }).rotate();
      const metadata = await image.metadata();

      await image.clone().resize(480, 480, { fit: 'inside', withoutEnlargement: true }).toFile(thumbPath);

      let takenAt = null;
      try {
        const exifData = await exifr.parse(filePath, ['DateTimeOriginal', 'CreateDate']);
        const d = exifData?.DateTimeOriginal || exifData?.CreateDate;
        if (d instanceof Date && !isNaN(d)) takenAt = d.toISOString();
      } catch {
        // no/unreadable EXIF, ignore
      }

      const info = insertPhoto.run({
        filename: file.filename,
        original_name: file.originalname,
        mime_type: file.mimetype,
        size: file.size,
        width: metadata.width || null,
        height: metadata.height || null,
        taken_at: takenAt,
      });

      created.push(serializePhoto(getPhotoById.get(info.lastInsertRowid)));
    } catch (err) {
      fs.rmSync(path.join(STORAGE_DIR, file.filename), { force: true });
      fs.rmSync(path.join(THUMB_DIR, file.filename), { force: true });
      created.push({ error: err.message, originalName: file.originalname });
    }
  }

  res.status(201).json({ photos: created });
});

app.get('/api/photos', (req, res) => {
  const { tag, album, favorite, q, sort } = req.query;
  const clauses = [];
  const params = {};

  let sql = 'SELECT DISTINCT p.* FROM photos p';
  if (tag) {
    sql += ' JOIN photo_tags pt ON pt.photo_id = p.id JOIN tags t ON t.id = pt.tag_id';
    clauses.push('t.name = @tag');
    params.tag = String(tag).toLowerCase();
  }
  if (album) {
    sql += ' JOIN album_photos ap ON ap.photo_id = p.id';
    clauses.push('ap.album_id = @album');
    params.album = Number(album);
  }
  if (favorite === '1' || favorite === 'true') {
    clauses.push('p.favorite = 1');
  }
  if (q) {
    clauses.push('(p.original_name LIKE @q OR p.description LIKE @q)');
    params.q = `%${q}%`;
  }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');

  const sortMap = {
    newest: 'p.uploaded_at DESC',
    oldest: 'p.uploaded_at ASC',
    taken: 'COALESCE(p.taken_at, p.uploaded_at) DESC',
    name: 'p.original_name COLLATE NOCASE ASC',
  };
  sql += ` ORDER BY ${sortMap[sort] || sortMap.newest}`;

  const rows = db.prepare(sql).all(params);
  res.json({ photos: rows.map(serializePhoto) });
});

app.get('/api/photos/:id', (req, res) => {
  const photo = getPhotoById.get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  res.json({ photo: serializePhoto(photo) });
});

app.patch('/api/photos/:id', (req, res) => {
  const photo = getPhotoById.get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  if (typeof req.body.favorite === 'boolean') {
    setFavoriteStmt.run(req.body.favorite ? 1 : 0, photo.id);
  }
  if (typeof req.body.description === 'string') {
    setDescriptionManualStmt.run(req.body.description.trim(), photo.id);
  }
  res.json({ photo: serializePhoto(getPhotoById.get(photo.id)) });
});

app.delete('/api/photos/:id', (req, res) => {
  const photo = getPhotoById.get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  deletePhotoStmt.run(photo.id);
  pruneOrphanTags.run();
  fs.rmSync(path.join(STORAGE_DIR, photo.filename), { force: true });
  fs.rmSync(path.join(THUMB_DIR, photo.filename), { force: true });
  res.status(204).end();
});

// ---- Tags ----

app.get('/api/tags', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.name, COUNT(pt.photo_id) AS count
       FROM tags t LEFT JOIN photo_tags pt ON pt.tag_id = t.id
       GROUP BY t.id ORDER BY t.name COLLATE NOCASE`
    )
    .all();
  res.json({ tags: rows });
});

app.post('/api/photos/:id/tags', (req, res) => {
  const photo = getPhotoById.get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  const name = (req.body.tag || '').trim();
  if (!name) return res.status(400).json({ error: 'Tag name required' });

  const tag = getOrCreateTag(name);
  linkTag.run(photo.id, tag.id);
  res.status(201).json({ photo: serializePhoto(getPhotoById.get(photo.id)) });
});

app.delete('/api/photos/:id/tags/:tag', (req, res) => {
  const photo = getPhotoById.get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  unlinkTagByName.run(photo.id, req.params.tag.trim().toLowerCase());
  pruneOrphanTags.run();
  res.json({ photo: serializePhoto(getPhotoById.get(photo.id)) });
});

// ---- Albums ----

app.get('/api/albums', (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.id, a.name, a.created_at, COUNT(ap.photo_id) AS count
       FROM albums a LEFT JOIN album_photos ap ON ap.album_id = a.id
       GROUP BY a.id ORDER BY a.name COLLATE NOCASE`
    )
    .all();
  res.json({ albums: rows });
});

app.post('/api/albums', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Album name required' });
  try {
    const info = db.prepare('INSERT INTO albums (name) VALUES (?)').run(name);
    res.status(201).json({ album: { id: info.lastInsertRowid, name, count: 0 } });
  } catch (err) {
    res.status(409).json({ error: 'Album already exists' });
  }
});

app.patch('/api/albums/:id', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Album name required' });
  const info = db.prepare('UPDATE albums SET name = ? WHERE id = ?').run(name, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.delete('/api/albums/:id', (req, res) => {
  const info = db.prepare('DELETE FROM albums WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

app.post('/api/albums/:id/photos', (req, res) => {
  const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: 'Album not found' });
  const photo = getPhotoById.get(req.body.photoId);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  db.prepare('INSERT OR IGNORE INTO album_photos (album_id, photo_id) VALUES (?, ?)').run(album.id, photo.id);
  res.status(201).json({ photo: serializePhoto(getPhotoById.get(photo.id)) });
});

app.delete('/api/albums/:id/photos/:photoId', (req, res) => {
  db.prepare('DELETE FROM album_photos WHERE album_id = ? AND photo_id = ?').run(req.params.id, req.params.photoId);
  const photo = getPhotoById.get(req.params.photoId);
  res.json({ photo: photo ? serializePhoto(photo) : null });
});

// ---- Settings ----

app.get('/api/settings', (req, res) => {
  res.json({
    hasApiKey: !!settings.getApiKey(),
    model: settings.getModel(),
    models: settings.MODELS,
  });
});

app.post('/api/settings', (req, res) => {
  if (typeof req.body.apiKey === 'string' && req.body.apiKey.trim()) {
    settings.setApiKey(req.body.apiKey.trim());
  }
  if (typeof req.body.model === 'string' && settings.MODELS.some((m) => m.id === req.body.model)) {
    settings.setModel(req.body.model);
  }
  res.json({
    hasApiKey: !!settings.getApiKey(),
    model: settings.getModel(),
    models: settings.MODELS,
  });
});

app.delete('/api/settings/api-key', (req, res) => {
  settings.setApiKey(null);
  res.json({ hasApiKey: false });
});

// ---- Scan ----

app.get('/api/scan', (req, res) => {
  res.json(scanner.getStatus());
});

app.post('/api/scan', (req, res) => {
  res.json(scanner.start());
});

app.post('/api/scan/pause', (req, res) => {
  scanner.pause();
  res.json(scanner.getStatus());
});

app.post('/api/scan/retry', (req, res) => {
  res.json(scanner.retryErrors());
});

app.post('/api/photos/:id/describe', async (req, res) => {
  const photo = getPhotoById.get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Not found' });

  const apiKey = settings.getApiKey();
  if (!apiKey) return res.status(400).json({ error: 'Add an Anthropic API key in Settings first.' });

  try {
    await scanner.describeOnePhoto(photo.id, photo.filename, apiKey, settings.getModel());
    res.json({ photo: serializePhoto(getPhotoById.get(photo.id)) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`Photo app running at http://localhost:${PORT}`);
});
