'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminKey } from '@/lib/use-admin-key';
import { xlmToStroops } from '@/lib/format';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function CreateMarketPage() {
  const { adminKey, setAdminKey } = useAdminKey();
  const router = useRouter();

  const [strikeUsd, setStrikeUsd] = useState('0.15');
  const [expiryLocal, setExpiryLocal] = useState('');
  const [graceMins, setGraceMins] = useState('60');
  const [baseFeeBps, setBaseFeeBps] = useState('100');
  const [minFeeBps, setMinFeeBps] = useState('20');
  const [liquidityXlm, setLiquidityXlm] = useState('1000');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const strikeCents = Math.round(parseFloat(strikeUsd) * 100).toString();
      const expiryUnix = Math.floor(new Date(expiryLocal).getTime() / 1000);
      const market = await api.createMarket(adminKey, {
        strikePriceCents: strikeCents,
        expiry: expiryUnix,
        gracePeriodSecs: Number(graceMins) * 60,
        baseFeeBps: Number(baseFeeBps),
        minFeeBps: Number(minFeeBps),
        initialLiquidityStroops: xlmToStroops(liquidityXlm).toString(),
      });
      router.push(`/market/${market.contractId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Create market</h1>
      <Card>
        <CardBody>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm">
              Admin key
              <Input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                className="mt-1"
                required
              />
            </label>
            <label className="block text-sm">
              Strike price (USD)
              <Input
                value={strikeUsd}
                onChange={(e) => setStrikeUsd(e.target.value)}
                className="mt-1"
                inputMode="decimal"
                required
              />
            </label>
            <label className="block text-sm">
              Expiry
              <input
                type="datetime-local"
                value={expiryLocal}
                onChange={(e) => setExpiryLocal(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
                required
              />
            </label>
            <label className="block text-sm">
              Grace period (mins)
              <Input value={graceMins} onChange={(e) => setGraceMins(e.target.value)} className="mt-1" />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm">
                Base fee (bps)
                <Input value={baseFeeBps} onChange={(e) => setBaseFeeBps(e.target.value)} className="mt-1" />
                <span className="mt-1 block text-xs text-[var(--faint)]">fee on a fresh market</span>
              </label>
              <label className="block text-sm">
                Min fee (bps)
                <Input value={minFeeBps} onChange={(e) => setMinFeeBps(e.target.value)} className="mt-1" />
                <span className="mt-1 block text-xs text-[var(--faint)]">floor as volume grows</span>
              </label>
            </div>
            <label className="block text-sm">
              Initial liquidity (XLM)
              <Input
                value={liquidityXlm}
                onChange={(e) => setLiquidityXlm(e.target.value)}
                className="mt-1"
              />
              <span className="mt-1 block text-xs text-[var(--faint)]">
                Seeds the AMM pool 50/50 — pulled from the oracle keypair.
              </span>
            </label>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Deploying…' : 'Deploy market'}
            </Button>
            {error && <p className="text-xs text-[var(--no)] break-all">{error}</p>}
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
