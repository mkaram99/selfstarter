import { useCallback, useRef, useState } from 'react';
import { Query, AssetField, MediaType, getPermissionsAsync } from 'expo-media-library';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { getDb, upsertPhotoStub, ensureStubRow, ensureUri, setDescription, setScanError, getUnscanned } from './db';
import { getApiKey, getModel } from './settings';
import { describeImage } from './anthropicVision';

const INDEX_BATCH_SIZE = 100;
const DESCRIBE_BATCH_SIZE = 8;

async function describeOnePhoto({ db, apiKey, model, row }) {
  const uri = row.uri || (await ensureUri(db, row.asset_id));
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 1024 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
  context.release();
  rendered.release();

  if (!saved.base64) throw new Error('Failed to encode photo for upload');

  const description = await describeImage({ apiKey, model, base64: saved.base64, mediaType: 'image/jpeg' });
  setDescription(db, row.asset_id, description);
  return description;
}

// Re-describes a single photo on demand (e.g. a "regenerate" button on the detail screen),
// independent of the batch scan loop above.
export async function describeSinglePhoto(assetId) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('Add an Anthropic API key in Settings before scanning.');
  const model = await getModel();
  const db = getDb();
  ensureStubRow(db, assetId);
  return describeOnePhoto({ db, apiKey, model, row: { asset_id: assetId, uri: null } });
}

export function useScanner() {
  const [status, setStatus] = useState('idle'); // idle | indexing | describing | paused | done | error
  const [progress, setProgress] = useState({ indexed: 0, scanned: 0, errors: 0, total: 0 });
  const [lastError, setLastError] = useState(null);
  const pausedRef = useRef(false);
  const runningRef = useRef(false);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setStatus((s) => (s === 'idle' || s === 'done' ? s : 'paused'));
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      const permission = await getPermissionsAsync();
      if (permission.status !== 'granted' && permission.accessPrivileges === 'none') {
        setStatus('error');
        setLastError('Photo library permission is not granted. Enable it in your device Settings.');
        return;
      }

      const apiKey = await getApiKey();
      if (!apiKey) {
        setStatus('error');
        setLastError('Add an Anthropic API key in Settings before scanning.');
        return;
      }
      const model = await getModel();

      pausedRef.current = false;
      setLastError(null);
      const db = getDb();

      // Pass 1: cheaply index every photo asset into the local DB (id, uri, dimensions, etc).
      setStatus('indexing');
      let offset = 0;
      for (;;) {
        if (pausedRef.current) return;
        const assets = await new Query()
          .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
          .orderBy(AssetField.CREATION_TIME)
          .limit(INDEX_BATCH_SIZE)
          .offset(offset)
          .exeForMetadata();

        if (assets.length === 0) break;
        for (const asset of assets) {
          upsertPhotoStub(db, {
            id: asset.id,
            filename: asset.filename,
            width: asset.width,
            height: asset.height,
            creationTime: asset.creationTime,
            isFavorite: asset.isFavorite,
          });
        }
        offset += assets.length;
        setProgress((p) => ({ ...p, indexed: offset, total: offset }));
        if (assets.length < INDEX_BATCH_SIZE) break;
      }

      // Pass 2: generate AI descriptions for anything not yet described.
      setStatus('describing');
      for (;;) {
        if (pausedRef.current) return;
        const rows = getUnscanned(db, DESCRIBE_BATCH_SIZE);
        if (rows.length === 0) break;

        for (const row of rows) {
          if (pausedRef.current) return;
          try {
            await describeOnePhoto({ db, apiKey, model, row });
            setProgress((p) => ({ ...p, scanned: p.scanned + 1 }));
          } catch (err) {
            setScanError(db, row.asset_id, err?.message || String(err));
            setProgress((p) => ({ ...p, errors: p.errors + 1 }));
          }
        }
      }

      setStatus('done');
    } catch (err) {
      setStatus('error');
      setLastError(err?.message || String(err));
    } finally {
      runningRef.current = false;
    }
  }, []);

  return { status, progress, lastError, start, pause };
}
