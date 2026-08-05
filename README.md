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
| `lib/webauthn.ts` | Passkey register/sign. The one piece of real crypto math here: browsers return DER-encoded, non-normalized ECDSA signatures; the contract needs raw r‖s, low-S normalized. Verified with `scripts/verify-webauthn-math.mjs` (real keypairs, real signatures, no browser needed). |
| `lib/passkey-wallet.ts` | Orchestrates onboarding (register passkey → backend deploys a smart wallet) and the two-step sponsored-transaction flow (prepare → sign → submit). |
| `lib/portfolio.ts` | Mirrors the contract's redemption math for position values. Verified with `scripts/verify-portfolio-math.mts`. |
| `lib/api.ts` | Typed client for every `polaris-oracle` endpoint this app uses. |
| `app/(app)/*` | Dashboard, market detail + trade form, portfolio, admin console — share the topbar shell in `(app)/layout.tsx`. |
| `app/docs/` | Public docs page, outside the `(app)` route group so it renders without the app chrome. |

## Running

```sh
cp .env.local.example .env.local   # NEXT_PUBLIC_ORACLE_URL must point at a running polaris-oracle
npm install
npm run dev      # http://localhost:3000
```

## Verifying the pure-logic pieces

This app ships no test framework (a deliberate choice matching the rest of
this system's scoping — see the other repos' READMEs for their own
boundaries). The two pieces of non-trivial logic are verified as standalone
scripts instead:

```sh
node scripts/verify-webauthn-math.mjs      # DER→raw + low-S signature conversion
node --experimental-strip-types scripts/verify-portfolio-math.mts   # redemption/mark-to-market math
```

## Known gaps

- No end-to-end browser test of the actual WebAuthn `navigator.credentials`
  flow — `verify-webauthn-math.mjs` proves the byte-level signature
  conversion is correct, but the full register→sign→submit path through a
  real authenticator hasn't been exercised in this build environment.
- Portfolio values are current-position marks, not historical realized P&L
  — see `lib/portfolio.ts`'s doc comment and the `/docs` page for why.
