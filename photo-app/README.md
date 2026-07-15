# Photo App

A small self-hosted app to access, tag, and organize your photos. Runs locally with a
Node/Express backend, SQLite for metadata (tags, albums, favorites), and a plain
HTML/JS gallery frontend — no build step, no external services.

## Features

- **Access** — drag-and-drop or click to upload photos (JPEG/PNG/WebP/GIF/HEIC);
  thumbnails are generated automatically and EXIF "date taken" is extracted when present.
- **Tag** — add/remove free-form tags per photo; browse by tag from a tag cloud in the
  sidebar; tag counts update live.
- **Organize** — group photos into albums, mark favorites, search by filename, and sort
  by upload date, date taken, or name.
- Click any photo to open a full-size lightbox with its tags, albums, and metadata.

## Getting started

```bash
cd photo-app
npm install
npm start
```

Then open http://localhost:4100 (override the port with `PORT=xxxx npm start`).

Uploaded originals are stored in `storage/`, generated thumbnails in `storage/_thumbs/`,
and all metadata (tags, albums, favorites) lives in `data/photos.db` (SQLite). Both
directories are gitignored — back them up if you care about the data.

## API

All state is exposed over a small REST API under `/api`:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/photos` | List photos; filter with `?tag=`, `?album=`, `?favorite=1`, `?q=`, sort with `?sort=newest\|oldest\|taken\|name` |
| POST | `/api/photos` | Upload photos (multipart field `photos`, up to 30 at once) |
| PATCH | `/api/photos/:id` | Update a photo, e.g. `{ "favorite": true }` |
| DELETE | `/api/photos/:id` | Delete a photo and its files |
| GET | `/api/tags` | List tags with usage counts |
| POST | `/api/photos/:id/tags` | Add a tag, e.g. `{ "tag": "vacation" }` |
| DELETE | `/api/photos/:id/tags/:tag` | Remove a tag |
| GET / POST | `/api/albums` | List / create albums |
| PATCH / DELETE | `/api/albums/:id` | Rename / delete an album |
| POST | `/api/albums/:id/photos` | Add a photo to an album, `{ "photoId": 1 }` |
| DELETE | `/api/albums/:id/photos/:photoId` | Remove a photo from an album |
