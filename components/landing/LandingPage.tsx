import { displayFont, monoFont } from "./fonts";
import { EstimateCtaProvider } from "./EstimateCta";
import { Hero } from "./Hero";
import { Services } from "./Services";
import { BehindTheScene } from "./BehindTheScene";
import { Commitments } from "./Commitments";
import { Footer } from "./Footer";

/**
 * Public marketing page — rendered at `/` for signed-out visitors (see
 * app/page.tsx and proxy.ts's `isPublicMarketingRoute`). Same five
 * section slots as the previous app's app/public/page.tsx, same
 * imagery/functionality (SMS estimate request, before/after drag
 * comparison) — restyled with its own typography and color system,
 * scoped to this subtree via the font variable classes below.
 *
 * The old testimonials section is gone, not just restyled: this is a
 * new business with no real client history, and that file's content
 * was invented names/quotes. Commitments (same scroll/drag carousel
 * mechanism) replaces it with honest statements about how the company
 * operates instead of fabricated social proof.
 */
export function LandingPage({ isSignedIn = false }: { isSignedIn?: boolean }) {
  return (
    <div className={`${displayFont.variable} ${monoFont.variable}`}>
      <EstimateCtaProvider>
        <main className="min-h-screen bg-[#F4F3EF]">
          <Hero isSignedIn={isSignedIn} />
          <Services />
          <BehindTheScene />
          <Commitments />
          <Footer />
        </main>
      </EstimateCtaProvider>
    </div>
  );
}
