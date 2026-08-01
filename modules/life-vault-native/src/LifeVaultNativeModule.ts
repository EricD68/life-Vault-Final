import { requireNativeModule } from 'expo-modules-core';

export type NativeVaultState = {
  configured: boolean;
  unlocked: boolean;
  biometricEnabled: boolean;
  autoLockSeconds: number;
  pinBlockedMillis: number;
  failedPinAttempts: number;
  hardwareBacked: boolean;
  strongBoxBacked: boolean;
  region: 'UK' | 'US' | 'ALL' | null;
};

export type BiometricAvailability = {
  available: boolean;
  code?: number;
  reason?: string;
  strongOnly?: boolean;
};

type LifeVaultNativeModule = {
  getState(): Promise<NativeVaultState>;
  touch(): Promise<boolean>;
  lock(): Promise<NativeVaultState>;
  createVault(region: 'UK' | 'US' | 'ALL'): Promise<NativeVaultState>;
  unlockWithPin(): Promise<NativeVaultState>;
  unlockWithBiometric(): Promise<NativeVaultState>;
  enableBiometric(): Promise<NativeVaultState>;
  disableBiometric(): Promise<NativeVaultState>;
  changePin(): Promise<NativeVaultState>;
  recoverPin(): Promise<NativeVaultState>;
  exportBackup(): Promise<boolean>;
  restoreBackup(uri: string): Promise<NativeVaultState>;
  setAutoLockSeconds(seconds: 30 | 60 | 120 | 300): Promise<NativeVaultState>;
  copySensitive(value: string, timeoutSeconds: number): Promise<boolean>;
  listItemSummaries(): Promise<string>;
  listItems(): Promise<string>;
  getItem(id: string): Promise<string | null>;
  saveItem(itemJson: string): Promise<boolean>;
  deleteItem(id: string): Promise<boolean>;
  listEntitySummaries(entityType: string): Promise<string>;
  searchEntities(query: string, entityType: string): Promise<string>;
  connectedEntities(entityId: string, depth: number): Promise<string>;
  getEntity(id: string): Promise<string | null>;
  saveEntity(entityJson: string): Promise<boolean>;
  deleteEntity(id: string): Promise<boolean>;
  listRenewals(): Promise<string>;
  biometricAvailability(): Promise<BiometricAvailability>;
};

export default requireNativeModule<LifeVaultNativeModule>('LifeVaultNative');
