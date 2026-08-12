# polaris-frontend

Next.js 16 app for **Polaris**. Entirely backend-mediated — every read and
write goes through `polaris-oracle`'s REST API (see `lib/api.ts`); there's
no direct Soroban RPC or wallet-extension SDK in this app at all.

See `../polaris-contracts/README.md` and `../polaris-oracle/README.md` for
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
| `app/(app)/*` | Dashboard, market detail + trade form, portfolio, admin console — share the topbar shell in `(app)/layout.tsx`. |
| `app/docs/` | Public docs page, outside the `(app)` route group so it renders without the app chrome. |
| `app/embed/[id]/` | The embeddable market widget — see "Embedding a market" below. Also outside `(app)`, no app chrome, minimal bundle. |
| `components/embed-code-button.tsx` | Generates the `<iframe>` snippet shown on the market detail page. |

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
