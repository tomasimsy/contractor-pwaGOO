/**
 * Typography for the redesigned estimate pages. The two CSS variables
 * are defined in globals.css and point at the root layout's Geist font,
 * so no extra font is fetched at build time. (Loading Fraunces and Inter
 * through next/font/google broke the Vercel production build.)
 */

/** Tailwind classes that apply the two faces. */
export const DOC_DISPLAY = "font-[family-name:var(--font-doc-display)]";
export const DOC_BODY = "font-[family-name:var(--font-doc-body)]";
