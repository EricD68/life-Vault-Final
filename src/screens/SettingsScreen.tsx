import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { exportBackupToDocument } from '../vault/backup';
import { vaultManager, userMessage } from '../vault/vaultManager';
import { useVault } from '../context/VaultContext';

const TIMEOUTS: Array<{ seconds: 30 | 60 | 120 | 300; label: string }> = [
  { seconds: 30, label: '30 sec' },
  { seconds: 60, label: '1 min' },
  { seconds: 120, label: '2 min' },
  { seconds: 300, label: '5 min' },
];

export default function SettingsScreen({ navigation }: any) {
  const { state, refreshState, setAutoLockSeconds } = useVault();
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    vaultManager.biometricAvailability().then((value) => setBiometricAvailable(value.available)).catch(() => undefined);
  }, []);

  async function run(operation: () => Promise<unknown>, failureTitle: string, successMessage?: string) {
    setBusy(true);
    try {
      await operation();
      await refreshState();
      if (successMessage) Alert.alert('Done', successMessage);
    } catch (error) {
      const message = userMessage(error);
      if (message) Alert.alert(failureTitle, message);
    } finally {
      setBusy(false);
    }
  }

  async function exportBackup() {
    setBusy(true);
    try {
      await exportBackupToDocument();
      Alert.alert('Backup created', 'Save the encrypted file to USB, local Files or your chosen storage provider. Keep the 24-word phrase separately.');
    } catch (error) {
      const message = userMessage(error);
      if (message) Alert.alert('Could not create backup', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionLabel}>Auto-lock</Text>
      <Text style={styles.hint}>The vault locks immediately whenever the app leaves the foreground.</Text>
      <View style={styles.rowWrap}>
        {TIMEOUTS.map(({ seconds, label }) => (
          <Pressable
            key={seconds}
            disabled={busy}
            style={[styles.chip, state.autoLockSeconds === seconds && styles.chipSelected]}
            onPress={() => run(() => setAutoLockSeconds(seconds), 'Could not update auto-lock')}
          >
            <Text style={[styles.chipText, state.autoLockSeconds === seconds && styles.chipTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Security</Text>
      <Pressable style={styles.rowButton} disabled={busy} onPress={() => run(() => vaultManager.changePin(), 'PIN was not changed', 'Your Life Vault PIN has been changed.')}>
        <Text style={styles.rowButtonText}>Change separate Life Vault PIN</Text>
      </Pressable>

      {biometricAvailable && !state.biometricEnabled && (
        <Pressable style={styles.rowButton} disabled={busy} onPress={() => run(() => vaultManager.enableBiometric(), 'Biometrics were not enabled', 'Strong biometric unlock is enabled.')}>
          <Text style={styles.rowButtonText}>Enable strong fingerprint / face unlock</Text>
        </Pressable>
      )}
      {state.biometricEnabled && (
        <Pressable style={styles.rowButton} disabled={busy} onPress={() => run(() => vaultManager.disableBiometric(), 'Biometrics were not disabled', 'Biometric unlock is disabled.')}>
          <Text style={styles.rowButtonText}>Disable biometric unlock</Text>
        </Pressable>
      )}

      <Text style={styles.securityStatus}>
        Hardware-backed key: {state.hardwareBacked ? 'Yes' : 'No'} · StrongBox: {state.strongBoxBacked ? 'Yes' : 'No / unavailable'}
      </Text>

      <Text style={styles.sectionLabel}>Backup and transfer</Text>
      <Pressable style={styles.rowButton} disabled={busy} onPress={exportBackup}>
        <Text style={styles.rowButtonText}>Create encrypted backup</Text>
      </Pressable>
      <Pressable style={styles.rowButton} disabled={busy} onPress={() => navigation.navigate('Restore')}>
        <Text style={styles.rowButtonText}>Restore / transfer from backup</Text>
      </Pressable>
      <Text style={styles.hint}>The backup contains encrypted vault data and a recovery-wrapped key. It never contains the Life Vault PIN or the 24 recovery words.</Text>

      <Pressable style={styles.dangerButton} disabled={busy} onPress={() => run(() => vaultManager.lock(), 'Could not lock')}>
        <Text style={styles.dangerText}>Lock now</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, backgroundColor: '#FFFFFF', flexGrow: 1 },
  sectionLabel: { color: '#5B6470', fontSize: 13, marginTop: 22, marginBottom: 10, textTransform: 'uppercase' },
  hint: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: '#D7DAE0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
  chipSelected: { backgroundColor: '#5B8CFF', borderColor: '#5B8CFF' },
  chipText: { color: '#5B6470', fontSize: 13 },
  chipTextSelected: { color: '#FFFFFF' },
  rowButton: { backgroundColor: '#F0F1F4', borderRadius: 10, padding: 15, marginBottom: 10 },
  rowButtonText: { color: '#12151A', fontSize: 15 },
  securityStatus: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginTop: 2 },
  dangerButton: { padding: 15, marginTop: 22, alignItems: 'center' },
  dangerText: { color: '#D64545', fontSize: 15 },
});
