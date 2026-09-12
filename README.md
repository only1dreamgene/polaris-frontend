# polaris-frontend

[![CI](https://github.com/samuel2926i39-art/polaris-frontend/actions/workflows/ci.yml/badge.svg)](https://github.com/samuel2926i39-art/polaris-frontend/actions/workflows/ci.yml)

Next.js 16 app for **Polaris**. Entirely backend-mediated — every read and
write goes through `polaris-oracle`'s REST API (see `lib/api.ts`); there's
no direct Soroban RPC or wallet-extension SDK in this app at all.

See [`polaris-contracts`](https://github.com/samuel2926i39-art/polaris-contracts) and [`polaris-oracle`](https://github.com/samuel2926i39-art/polaris-oracle) for
the rest of the system.

## Why no Freighter

The original spec's frontend used a Freighter browser-extension wallet for
every bet. This build replaces that with passkey smart wallets (see the
contracts repo) end to end — bettors never hold a browser extension or a
seed phrase — and admin actions were always backend-mediated via a shared
API key, never a wallet signature. Once both of those are true, there's no
remaining role for Freighter to play, so it isn't a dependency here.

## Layout

| Path | Purpose |
|---|---|
| `lib/webauthn.ts` | Passkey register/sign. The one piece of real crypto math here: browsers return DER-encoded, non-normalized ECDSA signatures; the contract needs raw r‖s, low-S normalized. Verified in `webauthn.spec.ts` (real keypairs, real signatures, no browser needed). |
| `lib/passkey-wallet.ts` | Orchestrates onboarding (register passkey → backend deploys a smart wallet) and the two-step sponsored-transaction flow (prepare → sign → submit). |
| `lib/portfolio.ts` | Mirrors the contract's redemption math for position values. Verified in `portfolio.spec.ts` — this mirror had gone stale relative to a contract-side fix once already (see "Known gaps"), which is exactly the kind of drift a real test catches and a standalone script someone forgets to re-run doesn't. |
| `lib/amm.ts` | Mirrors the contract's constant-product swap math, to give `buy` a real slippage floor. `min_shares_out` had been hardcoded to `0` — no slippage protection at all — until pressure-testing this system caught it. Verified in `amm.spec.ts`. |
| `lib/api.ts` | Typed client for every `polaris-oracle` endpoint this app uses. |
| `app/(app)/*` | Dashboard, market detail + trade form, portfolio — share the topbar shell in `(app)/layout.tsx`. |
| `app/docs/` | Public docs page, outside the `(app)` route group so it renders without the app chrome. |
| `app/embed/[id]/` | The embeddable market widget — see "Embedding a market" below. Also outside `(app)`, no app chrome, minimal bundle. |
| `app/admin/*` | The admin dashboard — its own top-level route group (not nested in `(app)`), own sidebar shell. See "Admin dashboard" below. |
| `app/(app)/perpetual[s]/*`, `components/perpetual-trade-card.tsx` | `polaris-perpetual`'s own pages/trade widget — a separate route family from classic markets, not a shared one with a type badge. See "Perpetual markets" below. |
| `components/embed-code-button.tsx` | Generates the `<iframe>` snippet shown on the market detail page. |
| `components/result-reveal.tsx` | The one deliberate "moment" in this app — see "The result-reveal moment" below. |
| `lib/format.ts` | Centralizes amount/status/address formatting (`stroopsToXlm`, `centsToUsd`, `shortAddress`, `statusLabel`) and the resolution-polling helpers (`isPollableStatus`, `RESOLUTION_POLL_MS`). Every amount/address display in the app already routed through this before this round — confirmed by an explicit audit, not assumed — so making the blockchain invisible (below) was a vocabulary pass, not a formatting rewrite. |

## Embedding a market

Any market can run inside a third-party site via `/embed/[contractId]` — a
"Get embed code" button on the market detail page generates the snippet.
Two things about it are load-bearing, not incidental:

1. **It has to be served from this app's own origin, not `polaris-oracle`'s.**
   WebAuthn's relying-party id is tied to the document's origin a passkey
   was registered against. If the widget lived on the backend's domain
   instead, a passkey created in the flagship app would be a different
   (unusable) credential inside the iframe. Same origin is what makes a
   passkey a *portable* identity across every embed of this app, rather
   than a separate identity per surface.
2. **The embedding page's `<iframe>` needs `allow="publickey-credentials-get
   *; publickey-credentials-create *"`.** Without it, every passkey prompt
   inside the iframe fails silently — this is a real, easy-to-miss browser
   requirement for WebAuthn in a cross-origin iframe, not something this
   app can grant on the embedder's behalf. `next.config.ts` sets the
   response-side `Permissions-Policy` header to match, but that's the other
   half of the handshake, not a substitute for the `allow` attribute.

**Bundle size, measured rather than assumed:** loading `/embed/[id]` in a
real browser transfers ~562kb (~524kb JS) total; `/market/[id]` is actually
*larger* (~623kb/~559kb), mostly from Next's automatic prefetching of the
nav's other routes, which the embed doesn't have. The two biggest chunks
(~379kb combined, byte-identical between routes) are shared React/Next.js
runtime and polyfills present on every route regardless of what it
imports — not `@tanstack/react-query` or the Stellar SDK, both checked and
ruled out by grepping the built chunks directly. There isn't a low-risk
trim available here; meaningfully shrinking it further would mean not
sharing Next's client runtime for this route at all, a materially bigger
change than "remove an unused import."
## Making the blockchain invisible

An audit (not a guess) of every place blockchain vocabulary or a raw
on-chain value reached end-user UI found the formatting layer was already
clean (`lib/format.ts`, consistently used everywhere) — the actual gaps were
vocabulary and two small real bugs, both fixed in this pass:

- `trade-card.tsx` and `embed/[id]/page.tsx` set their error state from the
  raw thrown error instead of `messageFromApiError` (`lib/api.ts`'s
  unwrapper, already used by `wallet-provider.tsx` — now shared from one
  place instead of a second inline copy), meaning a raw `400 {...}` or
  on-chain revert string could reach a user on the one path that skipped it.
- Both also rendered a full, unlinked transaction hash as `Submitted:
  {txResult}` after a trade/redeem — replaced with `Confirmed — ref
  {shortAddress(txResult)}`.
- Copy sweep: "on-chain", "Soroban", and "Built on Stellar" language removed
  from end-user-facing strings (landing page, trade card, embed) in favor of
  the same true facts stated as outcomes ("settled automatically by a live
  price feed" instead of "settled on-chain by Pyth"). XLM amounts are left
  exactly as they were — that's real financial information the user is
  risking, not implementation detail to hide. The `/docs` page is
  deliberately untouched: its whole purpose is transparency for anyone who
  wants to verify the trust model, the same reason a whitepaper link isn't
  part of a main app's copy pass.

## The result-reveal moment

The one deliberate "moment" in this app: what a bettor sees the instant
their market resolves, rather than a plain "Trading is closed" line. Two
things had to be true before an animation was the right thing to add, both
confirmed by an audit before writing any component:

1. **The transition actually had to be caught.** `market`/`state` queries
   had no `refetchInterval` once a market left `'watching'` — a user sitting
   on the page at the moment of resolution saw nothing change until they
   navigated away and back. Fixed with a function-form `refetchInterval`
   (`isPollableStatus`/`RESOLUTION_POLL_MS` in `lib/format.ts`, 8s) that
   polls while a market is `'watching'`/`'pending'` and stops once it's
   genuinely terminal. This is short-interval polling, not real push — no
   websocket/SSE exists in `polaris-oracle` — stated plainly rather than
   oversold; it's frequent enough to feel near-instant around an expiry
   without polling forever.
2. **The decision logic already existed and had to be reused, not
   re-derived.** `ResultReveal` computes win/loss/refund via the *existing*
   `didWin()`/`redeemableValue()` in `lib/portfolio.ts` — a second copy of
   that math is exactly the failure mode that file's own doc comment warns
   about (see "Known gaps": it drifted out of sync with a real contract fix
   once already).

The embed page gets the same component (`compact` prop, smaller treatment)
rather than a third copy of this logic — consistent with this app's earlier
decision not to fork the trade flow itself between the two surfaces.

**Verified live on testnet**, both halves:
- **Render correctness**: a real wallet with a real, nonzero position on a
  market that had already resolved to `Cancelled` showed exactly `"Market
  cancelled" / "Refunded 4.15 XLM"` — matching `redeemableValue`'s
  half-per-share cancellation payout math precisely (8.31 XLM staked → 4.15
  refunded).
- **The live, no-reload transition**: a real email-login wallet bought a
  real position, the page was left open (no reload, no navigation) through
  the market's real expiry and grace period, and the transition was caught
  by the polling above rather than requiring a manual refresh.

One honest note from doing this live rather than assuming it: every step of
this chain (custodial wallet deploy, trade confirmation, expiry, grace,
cancel) is a real testnet operation, and each one routinely took anywhere
from ~15s to ~90s in this environment — nothing to do with this feature,
the same testnet latency `polaris-oracle/README.md`'s bugs 6–8 already
document. A verification script that doesn't budget generously for that
will look like a bug in the reveal when the actual cause is just an
impatient test.

## Admin dashboard

Rebuilt from a single flat page (an admin-key input plus a market list with
Settle/Cancel buttons) into a real sectioned dashboard — grouped sidebar
nav: **Platform** (Overview), **Finance** (Markets, Fee Revenue, Treasury),
**Infrastructure** (Wallets, Blockchain, Fraud & Trust). No Growth group —
Polaris has no referrals/notifications/waitlist concept, and an empty nav
item is worse than not having the section.

Two structural decisions worth knowing if you're extending this:

1. **`/admin` moved out of the `(app)` route group into its own top-level
   `app/admin/*` group**, not just for tidiness — `(app)/layout.tsx` renders
   the public Markets/Portfolio/Docs header unconditionally around its
   children, and a nested layout can only *add* to a parent's chrome, never
   replace it. The dashboard needed its own full-bleed shell with no
   public-site nav above it, which only a top-level move achieves. This is
   the first non-root nested layout (`app/admin/layout.tsx`) in this
   codebase.
2. **A new `AdminKeyProvider`** (scoped to `/admin/*` only) promotes the old
   per-component `useAdminKey` hook into a shared context that gates the
   whole tree behind a key-entry screen — probing once per key change, not
   once per page navigation. `(app)/create/page.tsx` (market creation, also
   admin-only) still uses the original `lib/use-admin-key.ts` unchanged;
   unifying the two wasn't part of this pass, so it wasn't touched. This is
   genuinely new UX behavior, not a promotion of the old page's behavior
   (which did zero client-side gating) — and it's still only a convenience
   gate: the key lives in the same `sessionStorage`, real enforcement stays
   100% server-side in `polaris-oracle`'s `AdminGuard`.

No chart-library dependency — a small new `BarList` component (genuinely
new, not a reskin of `odds-bar.tsx`, a fixed two-value split rather than an
arbitrary ranked list) covers Fee Revenue's per-market breakdown and
Overview's status counts. The data behind every section (fee revenue,
treasury flows, wallet activity, settlement cross-checks) is served by
`polaris-oracle`'s new `admin.controller.ts` — see that repo's README for
how it's captured with no indexer, and the honest limits (forward-looking
only, fee revenue is an estimate, passkey wallet coverage isn't exhaustive).

## Perpetual markets

`polaris-perpetual` (see `polaris-contracts/README.md`'s "The perpetual
contract") is a second, continuous-trading contract kind — no strike
price, no expiry, no resolution event. Deliberately its **own** route
family (`/perpetuals`, `/perpetual/[id]`, `admin/perpetuals`) rather than
folded into the existing markets pages with a type badge — `polaris-oracle`
tracks it in a separate table with a different shape entirely (see that
repo's README), so a shared list/schema on this side would just be hiding
the same mismatch behind a UI layer.

**A new `PerpetualTradeCard`, not a `kind`-parameterized `TradeCard`.**
The two contracts share `buy`'s exact mechanics, but the *trading model*
differs in a way that matters for the UI, not just the data: a classic
market is "place a bet, wait for one resolution event" — `TradeCard`'s
`ResultReveal`/`rolloverFromMarketId`/"next round" machinery all exist
for that specific shape, none of which a perpetual has (it never resolves
to a winner; every complementary pair pays the same 0.5 XLM regardless of
side once `terminate()` fires). `TradeCard`'s own doc comment already
records the lesson this project learned about forking *the same* betting
flow across two pages (`lib/portfolio.ts`'s stale Cancelled-payout
mirror) — this isn't that: one flow, one page family, for a genuinely
different contract shape. `PerpetualTradeCard` reuses the same low-level
pieces that *are* generic (`OddsBar`, `estimateBuyOut`/`withSlippageTolerance`
from `lib/amm.ts`, `callAsWallet`, and `redeemableValue`'s `'Cancelled'`
case for `Terminated`'s identical 0.5-per-pair math) rather than
reimplementing any of them.

**`callAsWallet`/`api.prepareAuth`/`submitAuth`/`emailTrade` all gained an
optional `contractKind: 'market' | 'perpetual'` param** (default
`'market'`, so every existing call site keeps working unchanged) — it's
the only thing that changed in the trading/signing path, since
`polaris-oracle` needs to know which compiled contract spec to encode
trade arguments against.

**Scope this round**: buy + redeem-after-`terminate()` only — the same
scope classic markets' own `TradeCard` has today (it doesn't expose
`sell` either, even though `polaris-market` has always had one). A
perpetual's "last observed price" checkpoint renders on the detail page
when present, but every perpetual this system deploys has no oracle
configured yet, so it always reads as "no checkpoint recorded yet" for
now — see `polaris-oracle/README.md`'s "Perpetual markets" for what's
deferred and why.

**Verified live** (via `polaris-oracle`'s real API, mocked network
responses matching its real shapes to sidestep this dev environment's
CORS setup for a second local port): the perpetuals list, an open
perpetual's detail page + trade card (payout preview, Buy button),
a terminated perpetual's "trading is closed" state, and the admin
Perpetuals table (status badges, a correctly-disabled Terminate button
once already terminated) — plus the admin Overview page's new
`Perpetuals`/`Perpetuals by status` tiles reading real aggregate counts.

## Running

```sh
cp .env.local.example .env.local   # NEXT_PUBLIC_ORACLE_URL must point at a running polaris-oracle
npm install
npm run dev      # http://localhost:3000
```

## Testing

```sh
npm test          # vitest run — amm.spec.ts, portfolio.spec.ts, webauthn.spec.ts
```

This ran with no test framework at all until an audit pass added one — the
pure-logic pieces (AMM math, redemption math, the WebAuthn signature
conversion) had been verified with hand-run standalone scripts instead.
Those worked, but nothing forced them to be re-run: `lib/portfolio.ts`'s
mirror of the contract's redemption math drifted out of sync with a real
contract fix (`polaris-contracts`' cancelled-market payout formula changed;
this file didn't) for one full pass before a real test caught it. The
scripts are gone now, migrated into `*.spec.ts` files colocated with the
code they cover, importing the real functions under test rather than
re-declaring the logic — see `amm.spec.ts`, `portfolio.spec.ts`,
`webauthn.spec.ts`.

## Verified live: the real WebAuthn path, not just the byte math

Every other check of this flow up to this point verified the *signature
math* (`webauthn.spec.ts`) or the *deploy/trade plumbing* (email login,
which bypasses the browser ceremony entirely). Neither exercises
`navigator.credentials.create()`/`.get()` themselves.

Closed that gap by driving a real, headless Chromium instance (Playwright)
against the actual running app, with Chrome DevTools Protocol's `WebAuthn`
domain providing a virtual platform authenticator (ctap2, resident keys,
user verification) — every layer above the literal fingerprint sensor is
real: the browser's own WebAuthn implementation, `registerPasskey()` /
`signWithPasskey()`, the real DER→raw-lowS conversion, the real backend
relay, the real on-chain `__check_auth` verification.

Result, clicking through the actual UI (sign in with passkey → buy YES):
- A real wallet deployed and auto-funded on testnet through the *new,
  fixed* factory (see `polaris-contracts/README.md`'s "Factory wasm
  pinning").
- A real signed trade: `tx/prepare` → a genuine WebAuthn assertion from
  the virtual authenticator → `tx/submit` → confirmed on testnet,
  `getTransaction` status `SUCCESS`.
- The AMM pool and the wallet's own position moved by exactly the amounts
  the UI predicted before the click.

What's still outstanding after this is narrow: only the literal hardware
prompt (a real Face ID/Touch ID/Windows Hello dialog) hasn't fired — an
OS/browser-level interaction, not something this codebase's own logic
could behave differently for.

## Known gaps

- The full register→sign→submit WebAuthn path *has* now been exercised
  through a real browser, end to end against real testnet — see "Verified
  live" below. What's still outstanding is narrower than "hasn't been
  tested at all": a literal hardware authenticator (an actual Face
  ID/Touch ID/Windows Hello prompt) hasn't pressed the button — that's an
  OS/browser-level interaction this codebase's logic has no way to differ
  on, not something CI or this build environment can exercise regardless.
- Portfolio values are current-position marks, not historical realized P&L
  — see `lib/portfolio.ts`'s doc comment and the `/docs` page for why.
- Cross-origin `navigator.credentials.get()` (signing with an existing
  passkey, e.g. inside `/embed`) is broadly supported (Chrome, Safari
  15.5+); cross-origin `navigator.credentials.create()` (registering a
  *new* passkey) has narrower support and notably isn't supported in Safari
  as of this writing. A first-time visitor on Safari hitting a third-party
  embed may not be able to register there — signing in on the flagship app
  first, then returning to the embed to trade, works around it. Not
  patched around in this build; noted here rather than glossed over.
