/**
 * Typography scoped to the marketing landing page ONLY — imported
 * nowhere the authenticated app renders (app/layout.tsx keeps Geist
 * for the product itself).
 *
 *   Fraunces — a warm, soft-edged serif. The standard register for
 *   home/renovation branding: approachable and established, not
 *   corporate-tech. Used for headlines only.
 *
 *   Work Sans — clean, highly readable body copy. The quiet workhorse
 *   most real remodeling sites reach for so the photography and the
 *   headline carry the personality instead of the type.
 */
import { Fraunces, Work_Sans } from "next/font/google";

export const displayFont = Fraunces({
  subsets: ["latin"],
  variable: "--font-landing-display",
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

export const bodyFont = Work_Sans({
  subsets: ["latin"],
  variable: "--font-landing-body",
  weight: ["400", "500", "600"],
});
