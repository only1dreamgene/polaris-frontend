import type { Metadata } from 'next';
import { LandingHeader } from '@/components/landing/landing-header';
import { Hero } from '@/components/landing/hero';
import { TrustStrip } from '@/components/landing/trust-strip';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Features } from '@/components/landing/features';
import { TryItLive } from '@/components/landing/try-it-live';
import { ForBuilders } from '@/components/landing/for-builders';
import { Faq } from '@/components/landing/faq';
import { FinalCta } from '@/components/landing/final-cta';
import { LandingFooter } from '@/components/landing/landing-footer';

export const metadata: Metadata = {
  title: 'Polaris — Predict XLM. No wallet required.',
  description:
    'A trustless, fully-collateralized prediction market on XLM/USD, settled on-chain by Pyth. Sign in with a passkey — no browser extension, no seed phrase.',
};

export default function WelcomePage() {
  return (
    <>
      <LandingHeader />
      <main>
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <Features />
        <TryItLive />
        <ForBuilders />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </>
  );
}
