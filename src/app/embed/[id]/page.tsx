'use client';

import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useWallet } from '@/lib/wallet-provider';
import { callAsWallet } from '@/lib/passkey-wallet';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OddsBar } from '@/components/odds-bar';
import { centsToUsd, xlmToStroops } from '@/lib/format';

/**
 * The embeddable version of the market detail page — meant to run inside a
 * third-party site's `<iframe>`, not as a standalone destination. Same
 * origin as the rest of this app (see the root layout / next.config.ts),
 * which is what actually matters here: WebAuthn's relying-party id is tied
 * to the document's origin, so a passkey registered in the flagship app is
 * only usable inside this iframe *because* both are served from the same
 * place — see this repo's README for why the widget couldn't live on
 * `polaris-oracle` instead without breaking that.
 *
 * The embedding page's `<iframe>` tag MUST include
 * `allow="publickey-credentials-get *; publickey-credentials-create *"` or
 * every passkey prompt in here silently fails — see the "Get embed code"
 * button on the full market page, which generates a snippet with this
 * already set.
 */
export default function EmbedMarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { wallet, connecting, error: walletError, createWallet } = useWallet();
  const queryClient = useQueryClient();

  const [side, setSide] = useState<'Yes' | 'No'>('Yes');
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const { data: market } = useQuery({ queryKey: ['market', id], queryFn: () => api.getMarket(id) });
  const { data: price } = useQuery({
    queryKey: ['price', id],
    queryFn: () => api.getPrice(id),
    refetchInterval: 15_000,
    enabled: market?.status === 'watching',
  });

  if (!market) {
    return (
      <div className="p-4 text-sm text-[var(--muted)]">Loading…</div>
    );
  }

  const isOpen = market.status === 'watching';

  async function handleTrade() {
    if (!wallet) return;
    setBusy(true);
    setTxError(null);
    setTxResult(null);
    try {
      const stroops = xlmToStroops(amount);
      const { txHash } = await callAsWallet(wallet, id, 'buy', {
        prediction: side,
        collateral_amount: stroops.toString(),
        min_shares_out: '0',
      });
      setTxResult(txHash);
      await queryClient.invalidateQueries({ queryKey: ['price', id] });
    } catch (err) {
      setTxError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-3">
      <Card>
        <CardBody className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <a
              href={typeof window !== 'undefined' ? `${window.location.origin}/market/${id}` : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--faint)] hover:text-[var(--accent-ink)]"
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded text-white"
                style={{ background: 'linear-gradient(135deg, #5b4fe0, #8b7bff)', fontSize: 9 }}
              >
                ◈
              </span>
              Polaris
            </a>
            {!isOpen && <span className="text-xs text-[var(--faint)]">{market.status}</span>}
          </div>

          <h2 className="text-sm font-semibold leading-snug">
            XLM ≥ {centsToUsd(market.strikePriceCents)}?
          </h2>

          {price && <OddsBar yesBps={price.yesBps} noBps={price.noBps} />}

          {!isOpen ? (
            <p className="text-xs text-[var(--muted)]">Trading closed.</p>
          ) : !wallet ? (
            <Button
              size="sm"
              className="w-full"
              disabled={connecting}
              onClick={() => void createWallet('bettor')}
            >
              {connecting ? 'Creating…' : 'Sign in with passkey'}
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={side === 'Yes' ? 'yes' : 'outline'}
                  onClick={() => setSide('Yes')}
                >
                  YES
                </Button>
                <Button size="sm" variant={side === 'No' ? 'no' : 'outline'} onClick={() => setSide('No')}>
                  NO
                </Button>
              </div>
              <input
                className="h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-xs"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="XLM amount"
              />
              <Button
                size="sm"
                className="w-full"
                variant={side === 'Yes' ? 'yes' : 'no'}
                onClick={handleTrade}
                disabled={busy}
              >
                {busy ? 'Confirm with passkey…' : `Buy ${side}`}
              </Button>
            </div>
          )}

          {(txResult || txError || walletError) && (
            <p
              className={`break-all text-[10px] ${txError || walletError ? 'text-[var(--no)]' : 'text-[var(--yes)]'}`}
            >
              {txError ?? walletError ?? `Submitted: ${txResult}`}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
