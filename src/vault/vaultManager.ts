import { v4 as uuidv4 } from 'uuid';
import LifeVaultNative, {
  BiometricAvailability,
  NativeVaultState,
} from '../../modules/life-vault-native';
import { Region, VaultData, VaultItem } from './vaultModel';
import { ConnectedEntity, EntitySearchResult, EntitySummary, EntityType, RenewalSummary, VaultEntityBundle } from './entityModel';

export type VaultItemSummary = Omit<VaultItem, 'fields' | 'customFields'>;

const DEFAULT_STATE: NativeVaultState = {
  configured: false,
  unlocked: false,
  biometricEnabled: false,
  autoLockSeconds: 60,
  pinBlockedMillis: 0,
  failedPinAttempts: 0,
  hardwareBacked: false,
  strongBoxBacked: false,
  region: null,
};

let cachedState: NativeVaultState = DEFAULT_STATE;

function parseArray<T>(json: string): T[] {
  const value = JSON.parse(json);
  if (!Array.isArray(value)) throw new Error('Native vault returned invalid record data.');
  return value as T[];
}

export const vaultManager = {
  async refreshState(): Promise<NativeVaultState> {
    cachedState = await LifeVaultNative.getState();
    return cachedState;
  },

  state(): NativeVaultState {
    return cachedState;
  },

  isUnlocked(): boolean {
    return cachedState.unlocked;
  },

  async createVault(region: Region): Promise<NativeVaultState> {
    cachedState = await LifeVaultNative.createVault(region);
    return cachedState;
  },

  async unlockWithPin(): Promise<NativeVaultState> {
    cachedState = await LifeVaultNative.unlockWithPin();
    return cachedState;
  },

  async unlockWithBiometric(): Promise<NativeVaultState> {
    cachedState = await LifeVaultNative.unlockWithBiometric();
    return cachedState;
  },

  async biometricAvailability(): Promise<BiometricAvailability> {
    return LifeVaultNative.biometricAvailability();
  },

  async enableBiometric(): Promise<NativeVaultState> {
    cachedState = await LifeVaultNative.enableBiometric();
    return cachedState;
  },

  async disableBiometric(): Promise<NativeVaultState> {
    cachedState = await LifeVaultNative.disableBiometric();
    return cachedState;
  },

  async changePin(): Promise<NativeVaultState> {
    cachedState = await LifeVaultNative.changePin();
    return cachedState;
  },

  async recoverPin(): Promise<NativeVaultState> {
    cachedState = await LifeVaultNative.recoverPin();
    return cachedState;
  },

  async lock(): Promise<NativeVaultState> {
    cachedState = await LifeVaultNative.lock();
    return cachedState;
  },

  async touch(): Promise<void> {
    if (cachedState.unlocked) await LifeVaultNative.touch();
  },

  async setAutoLockSeconds(seconds: 30 | 60 | 120 | 300): Promise<NativeVaultState> {
    cachedState = await LifeVaultNative.setAutoLockSeconds(seconds);
    return cachedState;
  },

  async copySensitive(value: string, timeoutSeconds = 30): Promise<void> {
    await LifeVaultNative.copySensitive(value, timeoutSeconds);
  },

  async listItemSummaries(): Promise<VaultItemSummary[]> {
    return parseArray<VaultItemSummary>(await LifeVaultNative.listItemSummaries());
  },

  async listItems(): Promise<VaultItem[]> {
    return parseArray<VaultItem>(await LifeVaultNative.listItems());
  },

  async getVaultData(): Promise<VaultData> {
    const state = await this.refreshState();
    if (!state.unlocked) throw new Error('VAULT_LOCKED');
    return {
      version: 1,
      region: (state.region ?? 'ALL') as Region,
      items: await this.listItems(),
    };
  },

  async getItem(id: string): Promise<VaultItem | null> {
    const json = await LifeVaultNative.getItem(id);
    return json ? (JSON.parse(json) as VaultItem) : null;
  },

  async addItem(
    input: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<VaultItem> {
    const now = new Date().toISOString();
    const item: VaultItem = {
      ...input,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    await LifeVaultNative.saveItem(JSON.stringify(item));
    return item;
  },

  async updateItem(id: string, patch: Partial<VaultItem>): Promise<VaultItem> {
    const current = await this.getItem(id);
    if (!current) throw new Error('Item not found.');
    const updated: VaultItem = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await LifeVaultNative.saveItem(JSON.stringify(updated));
    return updated;
  },

  async deleteItem(id: string): Promise<void> {
    await LifeVaultNative.deleteItem(id);
  },

  async exportBackup(): Promise<void> {
    await LifeVaultNative.exportBackup();
  },

  async restoreBackup(uri: string): Promise<NativeVaultState> {
    cachedState = await LifeVaultNative.restoreBackup(uri);
    return cachedState;
  },

  async listEntities(entityType?: EntityType): Promise<EntitySummary[]> {
    return parseArray<EntitySummary>(await LifeVaultNative.listEntitySummaries(entityType ?? ''));
  },

  async searchEntities(query: string, entityType?: EntityType): Promise<EntitySearchResult[]> {
    return parseArray<EntitySearchResult>(await LifeVaultNative.searchEntities(query, entityType ?? ''));
  },

  async connectedEntities(entityId: string, depth = 3): Promise<ConnectedEntity[]> {
    return parseArray<ConnectedEntity>(await LifeVaultNative.connectedEntities(entityId, depth));
  },

  async getEntity(id: string): Promise<VaultEntityBundle | null> {
    const json = await LifeVaultNative.getEntity(id);
    return json ? (JSON.parse(json) as VaultEntityBundle) : null;
  },

  async saveEntity(entity: VaultEntityBundle): Promise<void> {
    await LifeVaultNative.saveEntity(JSON.stringify(entity));
  },

  async deleteEntity(id: string): Promise<void> {
    await LifeVaultNative.deleteEntity(id);
  },

  async listRenewals(): Promise<RenewalSummary[]> {
    return parseArray<RenewalSummary>(await LifeVaultNative.listRenewals());
  },
};

export function userMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const cleaned = raw.replace(/^\[Error:\s*/i, '').replace(/\]$/, '');
  if (cleaned.includes('ERR_CANCELLED') || cleaned.toLowerCase().includes('cancelled')) return '';
  if (cleaned.includes('Incorrect Life Vault PIN')) return cleaned;
  if (cleaned.includes('temporarily locked')) return cleaned;
  if (cleaned.includes('recovery phrase')) return cleaned;
  return cleaned || 'The secure vault operation failed.';
}
