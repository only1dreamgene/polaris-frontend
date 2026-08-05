'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPasskeyWallet, loadStoredWallet, type StoredWallet } from './passkey-wallet';

interface WalletContextValue {
  wallet: StoredWallet | null;
  connecting: boolean;
  error: string | null;
  createWallet: (displayName: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWallet(loadStoredWallet());
  }, []);

  const createWallet = useCallback(async (displayName: string) => {
    setConnecting(true);
    setError(null);
    try {
      const w = await createPasskeyWallet(displayName);
      setWallet(w);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  }, []);

  return (
    <WalletContext.Provider value={{ wallet, connecting, error, createWallet }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
