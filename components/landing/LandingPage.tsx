import { displayFont, monoFont } from "./fonts";
import { EstimateCtaProvider } from "./EstimateCta";
import { Hero } from "./Hero";
import { Services } from "./Services";
import { BehindTheScene } from "./BehindTheScene";
import { Testimonials } from "./Testimonials";
import { Footer } from "./Footer";

/**
 * Public marketing page — rendered at `/` for signed-out visitors (see
 * app/page.tsx and proxy.ts's `isPublicMarketingRoute`). Ported from
 * the previous app's app/public/page.tsx: same five sections in the
 * same order, same content/imagery/functionality (SMS estimate
 * request, before/after drag comparison, auto-scrolling testimonials)
 * — restyled with its own typography and color system, scoped to this
 * subtree only via the font variable classes below, so nothing here
 * touches the authenticated app's Geist fonts or design tokens.
 */
export function LandingPage({ isSignedIn = false }: { isSignedIn?: boolean }) {
  return (
    <div className={`${displayFont.variable} ${monoFont.variable}`}>
      <EstimateCtaProvider>
        <main className="min-h-screen bg-[#F4F3EF]">
          <Hero isSignedIn={isSignedIn} />
          <Services />
          <BehindTheScene />
          <Testimonials />
          <Footer />
        </main>
      </EstimateCtaProvider>
    </div>
  );
}
