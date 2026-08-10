'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  clearStoredWallet,
  createPasskeyWallet,
  loadStoredWallet,
  type StoredWallet,
  type WalletCreationStep,
} from './passkey-wallet';
import { humanizeWebAuthnError } from './webauthn';
import { api } from './api';

/** How long we wait for the passkey ceremony before giving up and surfacing a recoverable error — see the abort logic in `createWallet`. */
const CREATION_TIMEOUT_MS = 20_000;

interface WalletContextValue {
  wallet: StoredWallet | null;
  connecting: boolean;
  /** Which step of onboarding is in flight — lets the UI narrate the wait instead of showing one opaque spinner. */
  creationStep: WalletCreationStep | null;
  error: string | null;
  /** False in a browser/webview with no WebAuthn API at all — lets the UI show a fallback instead of a button that would just hang. */
  webauthnSupported: boolean;
  /** Returns the new wallet on success, or `null` if the ceremony failed/was cancelled (an `error` is already set in that case) — lets a caller chain straight into using it without waiting on a re-render. */
  createWallet: (displayName: string) => Promise<StoredWallet | null>;
  /** Aborts an in-flight passkey ceremony — the escape hatch for a ceremony that never resolves (see `CREATION_TIMEOUT_MS`). */
  cancelCreation: () => void;

  // Email fallback — see `EmailAuthService`'s doc comment in polaris-oracle
  // for why this exists (browsers/webviews with no usable WebAuthn).
  emailStep: 'idle' | 'code-sent';
  emailBusy: boolean;
  requestEmailCode: (email: string) => Promise<boolean>;
  verifyEmailCode: (email: string, code: string) => Promise<StoredWallet | null>;
  resetEmailFlow: () => void;

  logout: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [creationStep, setCreationStep] = useState<WalletCreationStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [webauthnSupported, setWebauthnSupported] = useState(true);
  const [emailStep, setEmailStep] = useState<'idle' | 'code-sent'>('idle');
  const [emailBusy, setEmailBusy] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<'timeout' | 'cancelled' | null>(null);

  useEffect(() => {
    setWebauthnSupported(typeof window !== 'undefined' && 'PublicKeyCredential' in window);

    const stored = loadStoredWallet();
    if (stored) {
      setWallet(stored);
      return;
    }
    // No passkey wallet in localStorage — check for an existing email
    // session (an httpOnly cookie, so this is the only way to discover it).
    api
      .getEmailSession()
      .then(({ address }) => setWallet({ kind: 'email', address }))
      .catch(() => {
        // No session — signed out, which is the default state anyway.
      });
  }, []);

  const cancelCreation = useCallback(() => {
    abortReasonRef.current = 'cancelled';
    abortControllerRef.current?.abort();
  }, []);

  const createWallet = useCallback(async (displayName: string) => {
    setConnecting(true);
    setError(null);
    abortReasonRef.current = null;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => {
      abortReasonRef.current = 'timeout';
      controller.abort();
    }, CREATION_TIMEOUT_MS);

    try {
      const w = await createPasskeyWallet(displayName, setCreationStep, controller.signal);
      setWallet(w);
      return w;
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError' && abortReasonRef.current === 'timeout') {
        setError(
          "Didn't hear back from your browser's passkey prompt. If you're in an embedded preview (e.g. VS Code's Simple Browser), open this page in a real browser tab instead.",
        );
      } else if (e.name === 'AbortError') {
        setError('Passkey setup was cancelled.');
      } else {
        setError(humanizeWebAuthnError(e));
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
      abortControllerRef.current = null;
      setConnecting(false);
      setCreationStep(null);
    }
  }, []);

  const requestEmailCode = useCallback(async (email: string) => {
    setEmailBusy(true);
    setError(null);
    try {
      await api.requestEmailCode(email);
      setEmailStep('code-sent');
      return true;
    } catch (err) {
      setError(messageFromApiError(err));
      return false;
    } finally {
      setEmailBusy(false);
    }
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    setEmailBusy(true);
    setError(null);
    try {
      const { address } = await api.verifyEmailCode(email, code);
      const w: StoredWallet = { kind: 'email', address };
      setWallet(w);
      setEmailStep('idle');
      return w;
    } catch (err) {
      setError(messageFromApiError(err));
      return null;
    } finally {
      setEmailBusy(false);
    }
  }, []);

  const resetEmailFlow = useCallback(() => {
    setEmailStep('idle');
    setError(null);
  }, []);

  const logout = useCallback(() => {
    clearStoredWallet();
    void api.emailLogout().catch(() => {});
    setWallet(null);
    setEmailStep('idle');
    setError(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        connecting,
        creationStep,
        error,
        webauthnSupported,
        createWallet,
        cancelCreation,
        emailStep,
        emailBusy,
        requestEmailCode,
        verifyEmailCode,
        resetEmailFlow,
        logout,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

/** `api.ts`'s `request()` throws a generic `METHOD /path failed: 400 {...}` error — pull the backend's own message out of the JSON body when possible instead of showing that raw text. */
function messageFromApiError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  const jsonStart = message.indexOf('{');
  if (jsonStart === -1) return message;
  try {
    const body = JSON.parse(message.slice(jsonStart)) as { message?: string };
    return body.message ?? message;
  } catch {
    return message;
  }
}
