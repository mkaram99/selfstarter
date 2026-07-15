import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { getApiKey, setApiKey, getModel, setModel, MODELS } from '../settings';
import { getDb, getStats, resetLibrary, clearScanErrors } from '../db';
import { useScanner } from '../scanner';
import ScanBanner from '../components/ScanBanner';

export default function SettingsScreen() {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [model, setModelState] = useState(null);
  const [stats, setStats] = useState({ total: 0, scanned: 0, errored: 0 });
  const scanner = useScanner();

  useEffect(() => {
    (async () => {
      const stored = await getApiKey();
      setHasStoredKey(!!stored);
      setModelState(await getModel());
    })();
  }, []);

  const refreshStats = useCallback(() => {
    setStats(getStats(getDb()) || { total: 0, scanned: 0, errored: 0 });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshStats();
    }, [refreshStats])
  );

  useEffect(() => {
    refreshStats();
  }, [scanner.progress, refreshStats]);

  const saveKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    await setApiKey(trimmed);
    setHasStoredKey(true);
    setApiKeyInput('');
    Alert.alert('Saved', 'API key stored securely on this device.');
  };

  const clearKey = async () => {
    await setApiKey(null);
    setHasStoredKey(false);
  };

  const chooseModel = async (id) => {
    await setModel(id);
    setModelState(id);
  };

  const confirmReset = () => {
    Alert.alert(
      'Clear index?',
      'This deletes all locally stored photo descriptions. Your photos are not affected — you can re-scan later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            resetLibrary(getDb());
            refreshStats();
          },
        },
      ]
    );
  };

  const retryErrors = () => {
    clearScanErrors(getDb());
    refreshStats();
    scanner.start();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Anthropic API key</Text>
        <Text style={styles.helpText}>
          Used to generate searchable descriptions for your photos. Stored only on this device.
        </Text>
        {hasStoredKey ? (
          <View style={styles.row}>
            <Text style={styles.keyStatus}>● Key saved</Text>
            <Pressable onPress={clearKey}>
              <Text style={styles.linkDanger}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="sk-ant-…"
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable style={styles.button} onPress={saveKey}>
              <Text style={styles.buttonText}>Save</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionTitle}>Description model</Text>
        {MODELS.map((m) => (
          <Pressable key={m.id} style={styles.modelRow} onPress={() => chooseModel(m.id)}>
            <Text style={styles.radio}>{model === m.id ? '●' : '○'}</Text>
            <Text style={styles.modelLabel}>{m.label}</Text>
          </Pressable>
        ))}

        <Text style={styles.sectionTitle}>Scan</Text>
        <Text style={styles.helpText}>
          {stats.total} photo{stats.total === 1 ? '' : 's'} indexed · {stats.scanned} described
          {stats.errored ? ` · ${stats.errored} failed` : ''}
        </Text>
        <ScanBanner scanner={scanner} />
        {stats.errored > 0 && (
          <Pressable style={styles.linkButton} onPress={retryErrors}>
            <Text style={styles.link}>Retry {stats.errored} failed photo{stats.errored === 1 ? '' : 's'}</Text>
          </Pressable>
        )}
        <Pressable style={styles.linkButton} onPress={confirmReset}>
          <Text style={styles.linkDanger}>Clear local index</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginTop: 20 },
  helpText: { fontSize: 13, color: '#777', lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  input: {
    flex: 1,
    backgroundColor: '#f2f2f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  button: { backgroundColor: '#4f6df5', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  keyStatus: { fontSize: 14, color: '#2f9e44', fontWeight: '600' },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  radio: { fontSize: 16, color: '#4f6df5' },
  modelLabel: { fontSize: 14, color: '#333' },
  linkButton: { marginTop: 14 },
  link: { fontSize: 14, color: '#4f6df5', fontWeight: '600' },
  linkDanger: { fontSize: 14, color: '#e0503a', fontWeight: '600' },
});
