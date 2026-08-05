// Chain interaction is entirely backend-mediated (reads and writes both go
// through polaris-oracle's REST API — see lib/api.ts) — there is no direct
// RPC/SDK usage in this app, so this only needs the backend's URL and the
// WebAuthn relying-party id.
export const config = {
  oracleUrl: process.env.NEXT_PUBLIC_ORACLE_URL ?? 'http://localhost:3001',
  webauthnRpId: process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID ?? 'localhost',
  webauthnRpName: 'Polaris',
};
