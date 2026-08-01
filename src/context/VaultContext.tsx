import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { vaultManager } from '../vault/vaultManager';
import type { NativeVaultState } from '../../modules/life-vault-native';

interface VaultContextValue {
  loading: boolean;
  state: NativeVaultState;
  setupComplete: boolean;
  unlocked: boolean;
  refreshState: () => Promise<NativeVaultState>;
  autoLockSeconds: number;
  setAutoLockSeconds: (seconds: 30 | 60 | 120 | 300) => Promise<void>;
  recordActivity: () => void;
}

const EMPTY_STATE: NativeVaultState = {
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

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<NativeVaultState>(EMPTY_STATE);
  const lastTouchSent = useRef(0);

  const refreshState = useCallback(async () => {
    const next = await vaultManager.refreshState();
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    void refreshState()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [refreshState]);

  useEffect(() => {
    const handleState = async (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        const locked = await vaultManager.lock().catch(() => null);
        if (locked) setState(locked);
      } else if (next === 'active') {
        await refreshState().catch(() => undefined);
      }
    };
    const subscription = AppState.addEventListener('change', handleState);
    return () => subscription.remove();
  }, [refreshState]);

  useEffect(() => {
    if (!state.unlocked) return;
    const timer = setInterval(() => {
      refreshState().catch(() => undefined);
    }, 1_000);
    return () => clearInterval(timer);
  }, [state.unlocked, refreshState]);

  const setAutoLockSeconds = useCallback(async (seconds: 30 | 60 | 120 | 300) => {
    const next = await vaultManager.setAutoLockSeconds(seconds);
    setState(next);
  }, []);

  const recordActivity = useCallback(() => {
    if (!state.unlocked) return;
    const now = Date.now();
    if (now - lastTouchSent.current < 750) return;
    lastTouchSent.current = now;
    vaultManager.touch().catch(() => undefined);
  }, [state.unlocked]);

  return (
    <VaultContext.Provider
      value={{
        loading,
        state,
        setupComplete: state.configured,
        unlocked: state.unlocked,
        refreshState,
        autoLockSeconds: state.autoLockSeconds,
        setAutoLockSeconds,
        recordActivity,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used inside VaultProvider');
  return context;
}
