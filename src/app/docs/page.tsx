import Link from 'next/link';

export const metadata = { title: 'Polaris — Docs' };

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-[var(--ink)]">
      <Link href="/" className="text-sm text-[var(--accent-ink)] underline">
        ← back to app
      </Link>
      <h1 className="mt-4 mb-2 text-3xl font-bold">Polaris</h1>
      <p className="mb-8 text-[var(--muted)]">
        A fully-collateralized binary prediction market on XLM/USD, settled by Pyth Lazer.
      </p>

      <section className="mb-8">
        <h2 className="mb-2 text-xl font-semibold">What this is</h2>
        <p className="mb-2 text-sm leading-relaxed">
          Bet YES or NO on whether XLM/USD will be at or above a strike price at a fixed expiry.
          Every stake is minted as a matched YES+NO share pair against locked collateral (native
          XLM) — never a shared pool you hope has a winner on the other side. A constant-product
          AMM between the YES and NO reserves gives continuous, live-updating implied odds and
          lets you exit a position before expiry, not just hold to resolution.
        </p>
        <p className="text-sm leading-relaxed">
          At expiry, anyone can submit a Pyth Lazer-signed price update; the contract verifies the
          signature on-chain and marks the winning side. If nothing ever gets settled — the oracle
          is down, whatever — anyone can permissionlessly cancel after a grace period, and both
          sides redeem 1:1. There is no scenario where funds are stuck.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-xl font-semibold">Signing in</h2>
        <p className="text-sm leading-relaxed">
          No browser extension, no seed phrase. &ldquo;Sign in with passkey&rdquo; registers a
          WebAuthn credential (Face ID / Touch ID / Windows Hello / a hardware key) and deploys a
          Soroban smart-wallet contract for it — a custom account whose <code>__check_auth</code>{' '}
          verifies your passkey&rsquo;s secp256r1 signature on-chain. The app pays the deploy fee
          and every trade&rsquo;s transaction fee; you never need to hold XLM just to interact.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-xl font-semibold">The trade mechanics</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Buy</strong> — locks collateral, mints an equal YES+NO pair, then swaps the
            unwanted side into more of the wanted side via the AMM. You get more shares than a
            plain split, priced by current implied odds.
          </li>
          <li>
            <strong>Sell</strong> — the reverse, solved as a single closed-form trade rather than
            &ldquo;swap then merge&rdquo;, which breaks when you&rsquo;re selling an entire
            one-sided position (see the contracts repo for why).
          </li>
          <li>
            <strong>Redeem</strong> — after resolution, winning shares pay 1:1 in collateral;
            losing shares pay nothing. After a cancellation, both sides pay 1:1.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-xl font-semibold">What &ldquo;portfolio&rdquo; actually shows</h2>
        <p className="text-sm leading-relaxed">
          Position values here are either an exact redeemable amount (for a resolved or cancelled
          market — this matches what <code>redeem()</code> would actually pay, exactly) or a
          mark-to-market estimate at the current AMM price (for an open market — actually selling
          a large position would move the price, so this is an estimate, not a guaranteed exit
          value). This build doesn&rsquo;t index historical trades, so it can&rsquo;t show
          cost-basis-based realized P&amp;L across a position you&rsquo;ve partially bought and
          sold over time — that would need an event indexer this system doesn&rsquo;t have.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-xl font-semibold">Trust model</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>Funds only ever move via contract logic — no admin function touches user funds.</li>
          <li>Settlement prices are verified on-chain; the backend is an untrusted relay.</li>
          <li>Cancellation after grace period is permissionless — liveness never depends on one party.</li>
          <li>
            The passkey smart-wallet pattern is adapted from a published reference
            implementation and grounded in real, self-verified cryptography, but has not had an
            independent security review — don&rsquo;t treat this as production-grade custody.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">Repos</h2>
        <p className="text-sm leading-relaxed">
          <code>polaris-contracts</code> (Rust/Soroban), <code>polaris-oracle</code> (NestJS
          settlement automation + passkey relay), <code>polaris-frontend</code> (this app). Each
          has its own README with the details this page glosses over.
        </p>
      </section>
    </div>
  );
}
