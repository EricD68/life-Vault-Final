import * as DocumentPicker from 'expo-document-picker';
import { vaultManager } from './vaultManager';

export async function exportBackupToDocument(): Promise<void> {
  await vaultManager.exportBackup();
}

export async function pickBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}
