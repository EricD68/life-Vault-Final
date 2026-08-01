import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { vaultManager, userMessage } from '../vault/vaultManager';
import { Region } from '../vault/vaultModel';
import { useVault } from '../context/VaultContext';
import { androidButtonFontFamily } from '../utils/androidFontFix';

export default function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const { refreshState } = useVault();
  const [region, setRegion] = useState<Region>('UK');
  const [busy, setBusy] = useState(false);

  async function createVault() {
    setBusy(true);
    try {
      await vaultManager.createVault(region);
      await refreshState();
    } catch (error) {
      const message = userMessage(error);
      if (message) Alert.alert('Vault setup was not completed', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Life Vault</Text>
      <Text style={styles.subtitle}>
        Life Vault uses its own separate PIN, hardware-bound encryption and a 24-word recovery
        phrase. Your phone PIN or pattern cannot unlock it.
      </Text>

      <Text style={styles.label}>Account templates</Text>
      {(['UK', 'US'] as Region[]).map((value) => (
        <Pressable
          key={value}
          style={[styles.option, region === value && styles.optionSelected]}
          onPress={() => setRegion(value)}
          disabled={busy}
        >
          <Text style={styles.optionText}>
            {value === 'UK' ? 'United Kingdom' : 'United States'}
          </Text>
        </Pressable>
      ))}

      <Pressable style={styles.primaryButton} onPress={createVault} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText} allowFontScaling={false}>
            Create secure vault
          </Text>
        )}
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Restore')} disabled={busy}>
        <Text style={styles.secondaryButtonText}>Restore an existing encrypted backup</Text>
      </Pressable>

      <Text style={styles.note}>
        Setup is committed only after you re-enter all 24 recovery words correctly.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, flexGrow: 1, backgroundColor: '#FFFFFF' },
  title: { fontSize: 26, fontWeight: '700', color: '#12151A', marginBottom: 10, fontFamily: androidButtonFontFamily() },
  subtitle: { fontSize: 14, color: '#5B6470', marginBottom: 28, lineHeight: 21 },
  label: { color: '#5B6470', fontSize: 13, marginBottom: 10, textTransform: 'uppercase' },
  option: { borderWidth: 1, borderColor: '#D7DAE0', borderRadius: 10, padding: 16, marginBottom: 12 },
  optionSelected: { borderColor: '#5B8CFF', backgroundColor: '#EAF0FF' },
  optionText: { color: '#12151A', fontSize: 16 },
  primaryButton: { backgroundColor: '#5B8CFF', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 10 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, fontFamily: androidButtonFontFamily() },
  secondaryButton: { borderWidth: 1, borderColor: '#D7DAE0', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 12 },
  secondaryButtonText: { color: '#12151A', fontSize: 14 },
  note: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginTop: 20 },
});
