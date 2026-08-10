/**
 * Typography scoped to the marketing landing page ONLY — imported
 * nowhere the authenticated app renders (app/layout.tsx keeps Geist
 * for the product itself).
 *
 *   Bricolage Grotesque — a bold, characterful display grotesk with
 *   unusual proportions. Distinct from the generic bold-Helvetica look
 *   every contractor site (this one's previous version included)
 *   reaches for.
 *
 *   IBM Plex Mono — labels, eyebrows, numbers, nav. A technical
 *   register against Bricolage's more expressive one.
 */
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";

export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-landing-display",
  weight: ["500", "700", "800"],
});

export const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-landing-mono",
  weight: ["400", "600"],
});
