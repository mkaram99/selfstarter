import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

function label(scanner) {
  switch (scanner.status) {
    case 'indexing':
      return `Indexing photos… ${scanner.progress.indexed}`;
    case 'describing':
      return `Describing photos… ${scanner.progress.scanned} done${
        scanner.progress.errors ? `, ${scanner.progress.errors} failed` : ''
      }`;
    case 'paused':
      return 'Scan paused';
    case 'done':
      return `Scan complete — ${scanner.progress.scanned} photo${
        scanner.progress.scanned === 1 ? '' : 's'
      } described`;
    case 'error':
      return scanner.lastError || 'Scan failed';
    default:
      return null;
  }
}

export default function ScanBanner({ scanner }) {
  const text = label(scanner);
  const isActive = scanner.status === 'indexing' || scanner.status === 'describing';

  if (!text) {
    return (
      <View style={styles.banner}>
        <Text style={styles.text}>Scan your library so photos can be found by description.</Text>
        <Pressable style={styles.button} onPress={scanner.start}>
          <Text style={styles.buttonText}>Scan library</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.banner, scanner.status === 'error' && styles.bannerError]}>
      {isActive && <ActivityIndicator size="small" style={styles.spinner} />}
      <Text style={[styles.text, styles.textFlex]} numberOfLines={2}>
        {text}
      </Text>
      <Pressable style={styles.button} onPress={isActive ? scanner.pause : scanner.start}>
        <Text style={styles.buttonText}>{isActive ? 'Pause' : 'Scan'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#eef0fb',
    borderBottomWidth: 1,
    borderBottomColor: '#e3e3e8',
  },
  bannerError: { backgroundColor: '#fde8e4' },
  spinner: { marginRight: 2 },
  text: { fontSize: 13, color: '#333' },
  textFlex: { flex: 1 },
  button: {
    backgroundColor: '#4f6df5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
