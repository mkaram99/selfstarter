import React, { useEffect, useState } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, View } from 'react-native';

import { getDb, ensureUri } from '../db';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMNS = 3;
const GAP = 2;
const CELL_SIZE = (SCREEN_WIDTH - GAP * (COLUMNS - 1)) / COLUMNS;

export default function PhotoThumbnail({ assetId, knownUri, onPress }) {
  const [uri, setUri] = useState(knownUri || null);

  useEffect(() => {
    let cancelled = false;
    if (!uri) {
      ensureUri(getDb(), assetId)
        .then((resolved) => {
          if (!cancelled) setUri(resolved);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [assetId, uri]);

  return (
    <Pressable style={styles.cell} onPress={onPress}>
      {uri ? (
        <Image source={{ uri }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholder]} />
      )}
    </Pressable>
  );
}

export { CELL_SIZE, COLUMNS, GAP };

const styles = StyleSheet.create({
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    marginRight: GAP,
    marginBottom: GAP,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e3e3e8',
  },
  placeholder: {
    backgroundColor: '#e3e3e8',
  },
});
