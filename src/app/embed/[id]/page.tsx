'use client';

import { use, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageFromApiError } from '@/lib/api';
import { useWallet } from '@/lib/wallet-provider';
import { callAsWallet } from '@/lib/passkey-wallet';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OddsBar } from '@/components/odds-bar';
import { AuthControls } from '@/components/auth-controls';
import { centsToUsd, statusLabel, stroopsToXlm, xlmToStroops, shortAddress } from '@/lib/format';
import { estimateBuyOut, withSlippageTolerance } from '@/lib/amm';

const SLIPPAGE_TOLERANCE_BPS = 200; // 2%

const STEP_LABEL: Record<string, string> = {
  passkey: 'Confirm Face ID / Touch ID…',
  deploying: 'Setting up your account…',
  done: 'Ready',
};

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
  const { wallet, connecting, creationStep, error: walletError, webauthnSupported, createWallet, cancelCreation } =
    useWallet();
  const queryClient = useQueryClient();

  const [side, setSide] = useState<'Yes' | 'No'>('Yes');
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  // Manual escape hatch to the email flow — shown after a live passkey
  // attempt fails (walletError set with no wallet yet), or forced on
  // whenever this browser/webview has no WebAuthn API at all.
  const [preferEmail, setPreferEmail] = useState(false);
  const showEmailFallback = !wallet && (preferEmail || !webauthnSupported);

  const { data: market } = useQuery({ queryKey: ['market', id], queryFn: () => api.getMarket(id) });
  const { data: price } = useQuery({
    queryKey: ['price', id],
    queryFn: () => api.getPrice(id),
    refetchInterval: 15_000,
    enabled: market?.status === 'watching',
  });
  const { data: state } = useQuery({
    queryKey: ['state', id],
    queryFn: () => api.getMarketState(id),
    enabled: market?.status === 'watching',
  });
  const { data: fee } = useQuery({
    queryKey: ['fee', id],
    queryFn: () => api.getFee(id),
    enabled: market?.status === 'watching',
    refetchInterval: 15_000,
  });

  const payoutPreview = useMemo(() => {
    if (!state || !fee) return null;
    try {
      const stroops = xlmToStroops(amount);
      if (stroops <= 0n) return null;
      const bonus = estimateBuyOut(side, stroops, BigInt(state.poolYes), BigInt(state.poolNo), fee.feeBps);
      return stroopsToXlm((stroops + bonus).toString());
    } catch {
      return null;
    }
  }, [amount, side, state, fee]);

  if (!market) {
    return (
      <div className="p-4 text-sm text-[var(--muted)]">Loading…</div>
    );
  }

  const isOpen = market.status === 'watching';

  async function handleTrade() {
    if (!state || !fee) return;
    setTxError(null);
    setTxResult(null);

    let activeWallet = wallet;
    if (!activeWallet) {
      activeWallet = await createWallet('bettor');
      if (!activeWallet) return;
    }

    setBusy(true);
    try {
      const stroops = xlmToStroops(amount);
      const estimate = estimateBuyOut(
        side,
        stroops,
        BigInt(state.poolYes),
        BigInt(state.poolNo),
        fee.feeBps,
      );
      const minSharesOut = withSlippageTolerance(estimate, SLIPPAGE_TOLERANCE_BPS);
      const { txHash } = await callAsWallet(activeWallet, id, 'buy', {
        prediction: side,
        collateral_amount: stroops.toString(),
        min_shares_out: minSharesOut.toString(),
      });
      setTxResult(txHash);
      await queryClient.invalidateQueries({ queryKey: ['price', id] });
    } catch (err) {
      setTxError(messageFromApiError(err));
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
            {!isOpen && <span className="text-xs text-[var(--faint)]">{statusLabel(market.status)}</span>}
          </div>

          <h2 className="text-sm font-semibold leading-snug">
            XLM ≥ {centsToUsd(market.strikePriceCents)}?
          </h2>
          <p className="-mt-1.5 text-[10px] text-[var(--faint)]">
            Can&rsquo;t lose more than you stake &mdash; funds are locked until the market settles.
          </p>

          {price && <OddsBar yesBps={price.yesBps} noBps={price.noBps} />}

          {!isOpen ? (
            <p className="text-xs text-[var(--muted)]">Trading closed.</p>
          ) : showEmailFallback ? (
            <AuthControls compact />
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
              {payoutPreview && (
                <p className="text-[10px] text-[var(--faint)]">
                  You get <span className="font-semibold text-[var(--ink)]">{payoutPreview} XLM</span> if {side.toUpperCase()} wins
                </p>
              )}
              <Button
                size="sm"
                className="w-full"
                variant={side === 'Yes' ? 'yes' : 'no'}
                onClick={handleTrade}
                disabled={busy || connecting || !state || !fee || !payoutPreview}
              >
                {connecting
                  ? creationStep
                    ? STEP_LABEL[creationStep]
                    : 'Setting up…'
                  : busy
                    ? wallet?.kind === 'email'
                      ? 'Placing bet…'
                      : 'Confirm with passkey…'
                    : `Buy ${side}`}
              </Button>
              {connecting ? (
                <button
                  type="button"
                  onClick={cancelCreation}
                  className="block w-full text-center text-[10px] text-[var(--faint)] underline"
                >
                  Cancel
                </button>
              ) : (
                !wallet && (
                  <p className="text-center text-[10px] text-[var(--faint)]">
                    No XLM needed &mdash; just Face ID / Touch ID, the first time you buy
                  </p>
                )
              )}
            </div>
          )}

          {(txResult || txError || walletError) && (
            <p
              className={`text-[10px] ${txError || walletError ? 'text-[var(--no)] break-all' : 'text-[var(--yes)]'}`}
            >
              {txError ?? walletError ?? (
                <>
                  Confirmed <span className="text-[var(--faint)]">— ref {shortAddress(txResult!)}</span>
                </>
              )}
            </p>
          )}
          {walletError && !wallet && !showEmailFallback && (
            <button
              type="button"
              onClick={() => setPreferEmail(true)}
              className="text-[10px] text-[var(--faint)] underline"
            >
              Try email instead
            </button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
