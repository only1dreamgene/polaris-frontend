import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        // /embed/* is designed to run inside a third-party <iframe> — no
        // X-Frame-Options/frame-ancestors restriction here (Next.js sets
        // none by default, which is what we want: allow framing from
        // anywhere, deliberately, since "embed this on any site" is the
        // point). The Permissions-Policy grant here is the response-side
        // half of enabling WebAuthn in a cross-origin iframe; the embedding
        // page's own <iframe allow="..."> attribute is the other half and
        // is NOT something this header can substitute for — see the
        // embed page's doc comment and the "Get embed code" snippet.
        source: '/embed/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'publickey-credentials-get=*, publickey-credentials-create=*',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
