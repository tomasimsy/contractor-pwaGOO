/** @type {import('tailwindcss').Config} */
module.exports = {
content: [
'./pages/**/*.{js,ts,jsx,tsx,mdx}',
'./components/**/*.{js,ts,jsx,tsx,mdx}',
'./app/**/*.{js,ts,jsx,tsx,mdx}',
],
theme: {
extend: {
colors: {
primary: "#0F172A", // deep navy
secondary: "#1E293B", // slate navy
accent: "#C19A6B", // warm tan / gold
background: "#F5EFE6", // soft tan background
surface: "#FFFDF9", // cards / containers

text: {
primary: "#111827", // rich dark text
secondary: "#475569", // muted slate
light: "#F8FAFC", // white-ish
},

border: "#D6C7B2",

warning: "#F59E0B",
error: "#EF4444",
success: "#10B981",
},
fontFamily: {
sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
},
},
},
plugins: [],
};