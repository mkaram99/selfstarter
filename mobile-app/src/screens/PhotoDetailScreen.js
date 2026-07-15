import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Asset } from 'expo-media-library';

import { getDb, getPhoto, ensureStubRow, ensureUri, updatePhotoDescriptionManual } from '../db';
import { describeSinglePhoto } from '../scanner';

export default function PhotoDetailScreen({ route }) {
  const { assetId } = route.params;
  const [uri, setUri] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const db = getDb();
    ensureStubRow(db, assetId);
    const row = getPhoto(db, assetId);
    setPhoto(row);
    setDescriptionDraft(row?.description || '');
    setFavorite(!!row?.favorite);
    const resolvedUri = await ensureUri(db, assetId);
    setUri(resolvedUri);
    try {
      const fav = await new Asset(assetId).getFavorite();
      setFavorite(fav);
    } catch {
      // favorite status unavailable on this platform/asset; keep DB value
    }
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFavorite = async () => {
    const next = !favorite;
    setFavorite(next);
    try {
      await new Asset(assetId).setFavorite(next);
    } catch (err) {
      setFavorite(!next);
      Alert.alert('Could not update favorite', String(err?.message || err));
    }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const description = await describeSinglePhoto(assetId);
      setDescriptionDraft(description);
    } catch (err) {
      Alert.alert('Could not describe photo', String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const saveDescription = () => {
    updatePhotoDescriptionManual(getDb(), assetId, descriptionDraft.trim());
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView>
        <View style={styles.imageWrap}>
          {uri ? <Image source={{ uri }} style={styles.image} resizeMode="contain" /> : <ActivityIndicator />}
        </View>

        <View style={styles.panel}>
          <View style={styles.row}>
            <Text style={styles.filename} numberOfLines={1}>
              {photo?.filename || 'Photo'}
            </Text>
            <Pressable onPress={toggleFavorite}>
              <Text style={styles.favoriteStar}>{favorite ? '★' : '☆'}</Text>
            </Pressable>
          </View>
          {photo?.width && photo?.height ? (
            <Text style={styles.meta}>
              {photo.width}×{photo.height}
            </Text>
          ) : null}

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.descriptionInput}
            multiline
            value={descriptionDraft}
            onChangeText={setDescriptionDraft}
            onBlur={saveDescription}
            placeholder={busy ? 'Describing…' : 'No description yet — tap Describe to generate one.'}
          />

          <View style={styles.actions}>
            <Pressable style={styles.button} onPress={regenerate} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buttonText}>Describe with AI</Text>}
            </Pressable>
            <Pressable style={styles.buttonSecondary} onPress={saveDescription}>
              <Text style={styles.buttonSecondaryText}>Save edits</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  imageWrap: { width: '100%', aspectRatio: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  panel: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filename: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  favoriteStar: { fontSize: 24, color: '#ffb400' },
  meta: { fontSize: 12, color: '#888' },
  label: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginTop: 12 },
  descriptionInput: {
    backgroundColor: '#f2f2f5',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  button: { flex: 1, backgroundColor: '#4f6df5', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  buttonSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4f6df5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonSecondaryText: { color: '#4f6df5', fontWeight: '600', fontSize: 14 },
});
