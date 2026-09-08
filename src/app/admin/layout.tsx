'use client';

import { useState } from 'react';
import { AdminKeyProvider, useAdminKey } from '@/lib/admin-key-provider';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function AdminGate({ children }: { children: React.ReactNode }) {
  const { adminKey, setAdminKey, status } = useAdminKey();
  // A local draft, submitted explicitly, rather than binding the input
  // straight to `adminKey`: the provider's probe effect fires on every
  // `adminKey` change, so binding directly would fire one request per
  // keystroke while typing instead of once on submit.
  const [draft, setDraft] = useState('');

  if (status === 'valid') {
    return (
      <div className="flex min-h-screen">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    );
  }

  // Automatically re-checking a key already in sessionStorage from a prior
  // visit — show a quiet loading state, not an empty form flashing in.
  if (status === 'checking' && !draft) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--muted)]">Checking saved admin key…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardBody>
          <h1 className="mb-1 text-lg font-bold">Polaris Admin</h1>
          <p className="mb-4 text-sm text-[var(--muted)]">Enter the admin key to continue.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAdminKey(draft);
            }}
            className="space-y-3"
          >
            <Input
              type="password"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="x-admin-key"
            />
            <Button type="submit" className="w-full" disabled={!draft || status === 'checking'}>
              {status === 'checking' ? 'Checking…' : 'Continue'}
            </Button>
            {status === 'invalid' && adminKey && (
              <p className="text-sm text-[var(--no)]">That key was rejected.</p>
            )}
          </form>
          <p className="mt-4 text-xs text-[var(--faint)]">
            This only hides the dashboard UI faster — the real check is server-side either way.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminKeyProvider>
      <AdminGate>{children}</AdminGate>
    </AdminKeyProvider>
  );
}
