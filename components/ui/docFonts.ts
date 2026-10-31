/**
 * Typography for the redesigned estimate pages (the design file's
 * Fraunces headings and Inter body). Loaded once in the root layout as
 * CSS variables, so any estimate component can reference them without
 * loading fonts itself. Other pages keep Geist.
 */
import { Fraunces, Inter } from "next/font/google";

export const docDisplayFont = Fraunces({
  subsets: ["latin"],
  variable: "--font-doc-display",
  weight: ["500", "600"],
});

export const docBodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-doc-body",
  weight: ["400", "500", "600"],
});

/** Tailwind classes that apply the two faces above. */
export const DOC_DISPLAY = "font-[family-name:var(--font-doc-display)]";
export const DOC_BODY = "font-[family-name:var(--font-doc-body)]";
