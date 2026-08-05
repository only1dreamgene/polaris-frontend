'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useWallet } from '@/lib/wallet-provider';
import { Button } from '@/components/ui/button';
import { shortAddress } from '@/lib/format';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { wallet, connecting, error, createWallet } = useWallet();
  const [name, setName] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white text-sm"
              style={{ background: 'linear-gradient(135deg, #5b4fe0, #8b7bff)' }}
            >
              ◈
            </span>
            Polaris
          </Link>
          <nav className="flex items-center gap-4 text-sm text-[var(--ink-soft)]">
            <Link href="/" className="hover:text-[var(--ink)]">
              Markets
            </Link>
            <Link href="/bets" className="hover:text-[var(--ink)]">
              Portfolio
            </Link>
            <Link href="/docs" className="hover:text-[var(--ink)]">
              Docs
            </Link>
          </nav>
          <div>
            {wallet ? (
              <span className="rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono">
                {shortAddress(wallet.address)}
              </span>
            ) : showNamePrompt ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createWallet(name || 'polaris-bettor');
                }}
              >
                <input
                  autoFocus
                  className="h-8 w-32 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-xs"
                  placeholder="your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button size="sm" type="submit" disabled={connecting}>
                  {connecting ? 'Creating…' : 'Create passkey'}
                </Button>
              </form>
            ) : (
              <Button size="sm" onClick={() => setShowNamePrompt(true)}>
                Sign in with passkey
              </Button>
            )}
          </div>
        </div>
        {error && (
          <div className="mx-auto max-w-5xl px-4 pb-2 text-xs text-[var(--no)]">{error}</div>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
