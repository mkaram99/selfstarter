import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';

import PhotoThumbnail, { COLUMNS } from '../components/PhotoThumbnail';
import ScanBanner from '../components/ScanBanner';
import { useScanner } from '../scanner';

const PAGE_SIZE = 60;

export default function LibraryScreen({ navigation }) {
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const scanner = useScanner();

  const loadPage = useCallback(
    async (startOffset) => {
      setLoading(true);
      try {
        const page = await new MediaLibrary.Query()
          .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
          .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: false })
          .limit(PAGE_SIZE)
          .offset(startOffset)
          .exeForMetadata();

        setAssets((prev) => (startOffset === 0 ? page : [...prev, ...page]));
        setOffset(startOffset + page.length);
        setHasMore(page.length === PAGE_SIZE);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (permission?.status === 'granted' || permission?.accessPrivileges === 'limited') {
      loadPage(0);
    }
  }, [permission?.status, permission?.accessPrivileges, loadPage]);

  if (!permission) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (permission.status !== 'granted' && permission.accessPrivileges !== 'limited') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>Photo access needed</Text>
        <Text style={styles.body}>
          Photo Search reads your photo library on-device to build a searchable index. Grant access to
          continue.
        </Text>
        <Text style={styles.link} onPress={requestPermission}>
          Grant access
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScanBanner scanner={scanner} />
      <FlatList
        data={assets}
        key={COLUMNS}
        numColumns={COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PhotoThumbnail
            assetId={item.id}
            onPress={() => navigation.navigate('PhotoDetail', { assetId: item.id })}
          />
        )}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (!loading && hasMore) loadPage(offset);
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.center}>
              <Text style={styles.body}>No photos found on this device.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={loading ? <ActivityIndicator style={styles.footerLoader} /> : null}
        contentContainerStyle={assets.length === 0 && styles.emptyList}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 14, color: '#666', textAlign: 'center' },
  link: { fontSize: 15, fontWeight: '600', color: '#4f6df5', marginTop: 8 },
  footerLoader: { marginVertical: 16 },
  emptyList: { flex: 1 },
});
