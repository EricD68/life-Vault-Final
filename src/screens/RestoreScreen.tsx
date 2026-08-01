import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { pickBackupFile } from '../vault/backup';
import { vaultManager, userMessage } from '../vault/vaultManager';
import { useVault } from '../context/VaultContext';
import { androidButtonFontFamily } from '../utils/androidFontFix';

export default function RestoreScreen() {
  const { refreshState } = useVault();
  const [busy, setBusy] = useState(false);

  async function restore() {
    const uri = await pickBackupFile();
    if (!uri) return;
    setBusy(true);
    try {
      await vaultManager.restoreBackup(uri);
      await refreshState();
    } catch (error) {
      const message = userMessage(error);
      if (message) Alert.alert('Backup was not restored', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Restore encrypted backup</Text>
      <Text style={styles.subtitle}>
        Select a Life Vault backup from local storage, a connected USB drive or another document provider. Android will then request the original 24-word phrase and a new separate Life Vault PIN.
      </Text>
      <Pressable style={styles.primaryButton} onPress={restore} disabled={busy}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Choose backup file</Text>}
      </Pressable>
      <Text style={styles.note}>Restore is staged and verified before it replaces any existing vault.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#FFFFFF' },
  title: { fontSize: 22, fontWeight: '700', color: '#12151A', marginBottom: 10, fontFamily: androidButtonFontFamily() },
  subtitle: { color: '#5B6470', fontSize: 14, marginBottom: 24, lineHeight: 21 },
  primaryButton: { backgroundColor: '#5B8CFF', borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, fontFamily: androidButtonFontFamily() },
  note: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginTop: 18 },
});
