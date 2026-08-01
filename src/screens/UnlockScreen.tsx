import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { vaultManager, userMessage } from '../vault/vaultManager';
import { useVault } from '../context/VaultContext';
import { androidButtonFontFamily } from '../utils/androidFontFix';

export default function UnlockScreen() {
  const { state, refreshState } = useVault();
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    vaultManager.biometricAvailability().then((result) => setBiometricAvailable(result.available)).catch(() => undefined);
  }, []);

  async function run(operation: () => Promise<unknown>) {
    setBusy(true);
    try {
      await operation();
      await refreshState();
    } catch (error) {
      await refreshState().catch(() => undefined);
      const message = userMessage(error);
      if (message) Alert.alert('Life Vault remains locked', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Life Vault Locked</Text>
      <Text style={styles.subtitle}>
        Use the separate Life Vault PIN. Your phone unlock pattern or PIN is not accepted.
      </Text>

      {state.pinBlockedMillis > 0 && (
        <Text style={styles.warning}>
          PIN entry is temporarily delayed after failed attempts.
        </Text>
      )}

      <Pressable style={styles.primaryButton} onPress={() => run(() => vaultManager.unlockWithPin())} disabled={busy}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Enter Life Vault PIN</Text>}
      </Pressable>

      {state.biometricEnabled && biometricAvailable && (
        <Pressable style={styles.secondaryButton} onPress={() => run(() => vaultManager.unlockWithBiometric())} disabled={busy}>
          <Text style={styles.secondaryButtonText}>Use strong fingerprint / face</Text>
        </Pressable>
      )}

      <Pressable style={styles.linkButton} onPress={() => run(() => vaultManager.recoverPin())} disabled={busy}>
        <Text style={styles.link}>Forgot Life Vault PIN? Recover with 24 words</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FFFFFF' },
  title: { fontSize: 26, fontWeight: '700', color: '#12151A', textAlign: 'center', fontFamily: androidButtonFontFamily() },
  subtitle: { fontSize: 14, color: '#5B6470', textAlign: 'center', lineHeight: 20, marginTop: 10, marginBottom: 26 },
  warning: { color: '#B45309', textAlign: 'center', marginBottom: 12 },
  primaryButton: { backgroundColor: '#5B8CFF', borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontFamily: androidButtonFontFamily() },
  secondaryButton: { borderWidth: 1, borderColor: '#D7DAE0', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 12 },
  secondaryButtonText: { color: '#12151A', fontSize: 14 },
  linkButton: { padding: 16, marginTop: 8 },
  link: { color: '#5B8CFF', textAlign: 'center', fontSize: 13 },
});
