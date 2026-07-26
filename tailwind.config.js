/** @type {import('tailwindcss').Config} */
module.exports = {
content: [
'./pages/**/*.{js,ts,jsx,tsx,mdx}',
'./components/**/*.{js,ts,jsx,tsx,mdx}',
'./app/**/*.{js,ts,jsx,tsx,mdx}',
],
theme: {
extend: {
// Color no longer lives here — it was never actually applied (Tailwind
// v4's @import "tailwindcss" in app/globals.css doesn't read this file
// without an explicit @config directive, which this project doesn't
// have), so this block was a dead, misleading second "source of truth"
// alongside the real one (the CSS custom properties + @theme inline in
// app/globals.css). Every color token (bg-primary, text-success, ...)
// is defined there now — see DESIGN_SYSTEM.md.
fontFamily: {
sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
},
},
},
plugins: [],
};
