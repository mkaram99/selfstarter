import React, { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDb, searchPhotos, ensureUri } from '../db';

function ResultRow({ row, onPress }) {
  const [uri, setUri] = useState(row.uri || null);

  useEffect(() => {
    let cancelled = false;
    if (!uri) {
      ensureUri(getDb(), row.asset_id)
        .then((resolved) => !cancelled && setUri(resolved))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [row.asset_id, uri]);

  return (
    <Pressable style={styles.row} onPress={onPress}>
      {uri ? <Image source={{ uri }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbPlaceholder]} />}
      <View style={styles.rowText}>
        <Text style={styles.filename} numberOfLines={1}>
          {row.filename || 'Photo'}
        </Text>
        <Text style={styles.description} numberOfLines={3}>
          {row.description}
        </Text>
      </View>
    </Pressable>
  );
}

export default function SearchScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      const db = getDb();
      setResults(searchPhotos(db, trimmed));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Search photos by content, e.g. 'dog at the beach'"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {results === null ? (
        <View style={styles.center}>
          <Text style={styles.hint}>
            Search matches AI-generated descriptions from scanned photos. Scan your library from the
            Library tab first.
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.hint}>No matches for "{query.trim()}".</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.asset_id}
          renderItem={({ item }) => (
            <ResultRow row={item} onPress={() => navigation.navigate('PhotoDetail', { assetId: item.asset_id })} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchBar: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#e3e3e8' },
  input: {
    backgroundColor: '#f2f2f5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  hint: { fontSize: 14, color: '#777', textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f3',
  },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#e3e3e8' },
  thumbPlaceholder: {},
  rowText: { flex: 1, justifyContent: 'center', gap: 4 },
  filename: { fontSize: 13, fontWeight: '600', color: '#333' },
  description: { fontSize: 13, color: '#666', lineHeight: 18 },
});
