import type { Metadata } from 'next';
import { QueryProvider } from '@/lib/query-provider';
import { WalletProvider } from '@/lib/wallet-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Polaris',
  description: 'A trustless prediction market on XLM/USD, settled by Pyth Lazer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <WalletProvider>{children}</WalletProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
