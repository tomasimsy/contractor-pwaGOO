# Design System

One design language for contractor-pwa. This documents the tokens and primitives that now exist; it does **not** claim every page has been migrated to them — see "Adoption status" at the bottom for what's real today vs. what's next.

## Why this exists

Before this pass, color had **three competing sources of truth**:
1. `tailwind.config.js` declared a navy/tan/gold palette (`primary: #0F172A`, `accent: #C19A6B`, ...) — but Tailwind v4 (`@import "tailwindcss"` in `globals.css`) never loads a JS config without an explicit `@config` directive, which this project didn't have. **That whole palette was dead code**, never actually rendering.
2. `app/globals.css` had a second, real palette (shadcn's neutral oklch grays) that `Button`/`Card`/every Radix-based component actually used.
3. ~180 files hand-picked raw Tailwind utilities directly (`bg-emerald-600`, `bg-slate-50`, `bg-amber-100`, ...) — over 600 occurrences across ~15 different green/amber/gray shades doing the same handful of jobs (brand color, success, warning, neutral surface).

Palette #2 is now the **one real system**, and it's been repointed to the app's actual brand green (previously undefined as a token at all) plus real semantic status colors.

## Color system

All colors are CSS custom properties in `app/globals.css`, mapped to Tailwind utilities via `@theme inline`. Never hardcode a hex/oklch value or a raw Tailwind color (`bg-emerald-600`) in a component — use the semantic name:

| Token | Utility | Use for |
|---|---|---|
| `--primary` / `--primary-foreground` | `bg-primary` `text-primary-foreground` | Brand actions — primary buttons, active nav, links |
| `--secondary` | `bg-secondary` | Secondary surfaces, secondary buttons |
| `--muted` / `--muted-foreground` | `bg-muted` `text-muted-foreground` | Subtle backgrounds, disabled/secondary text |
| `--accent` | `bg-accent` | Highlighted rows, active tab, hover accents |
| `--success` | `bg-success` `text-success` | Paid/approved/positive amounts |
| `--warning` | `bg-warning` | Pending/draft/needs-attention |
| `--danger` / `--destructive` | `bg-danger` | Overdue/errors/delete actions |
| `--info` | `bg-info` | Informational callouts |
| `--card` / `--border` / `--input` / `--ring` | — | Surfaces, borders, focus rings |

Dark mode is a real, working `.dark` class variant (previously the app had no dark values wired to any token at all) — every token above has a `.dark` counterpart. Toggling dark mode is not yet wired to a UI control anywhere in the app; the CSS is ready whenever that's added.

## Typography

Font is Inter, loaded via `next/font` in `app/layout.tsx` (there's also a redundant `<link>` tag to Google Fonts CDN for the same font in the same file — worth removing separately, it's duplicate font loading, not a design-system issue).

Use Tailwind's default type scale directly — no custom scale was introduced, since the default (`text-xs` → `text-4xl`) already covers this app's needs:

| Class | Use for |
|---|---|
| `text-xs` | Table headers (uppercase, tracked), metadata, badges |
| `text-sm` | Body text, form labels, table cells — the default |
| `text-base` | Emphasized body copy |
| `text-lg` / `text-xl` | Card/section titles |
| `text-2xl` / `text-3xl` | Page titles, dashboard KPI numbers |
| `font-semibold` | Titles, KPI values, table headers |
| `font-medium` | Labels, nav items |

## Components (`components/ui/`)

All new/rewritten this pass, all token-based (no hardcoded colors):

- **`button.tsx`** — already existed, already token-based (`bg-primary`, `bg-destructive`, ...). Untouched.
- **`Card.tsx`** — rewritten. Was hardcoded `bg-white` / a `navy`/`gold` boolean-prop hack. Now `variant`: `default | muted | accent | outline`, `padding`: `none | sm | md | lg`.
- **`badge.tsx`** *(new)* — the one status-pill component. `variant`: `neutral | success | warning | danger | info | primary`. Replace inline `<span className="bg-emerald-50 text-emerald-700 rounded-full ...">` with `<Badge variant="success">Paid</Badge>`.
- **`input.tsx`**, **`label.tsx`**, **`textarea.tsx`**, **`select.tsx`** *(new)* — no form primitives existed before this; every form built its own `<input>` styling by hand. These match Button's focus-ring/disabled/invalid states exactly.
- **`table.tsx`** *(new)* — `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`. `Table` wraps itself in its own `overflow-x-auto` container so a wide table never forces the whole page to scroll sideways on tablet/mobile.
- **`EmptyState.tsx`** *(new)* — one "nothing here yet" pattern (icon + title + description + optional action) for empty lists.
- **`LoadingState.tsx`** *(new)* — `Skeleton` (base block), `LoadingState` (spinner + label, for a whole page/panel), `SkeletonList` (row-shaped skeletons matching a list's real footprint, so the page doesn't jump when data arrives).

## Responsive spacing

A new scale in `app/globals.css`, registered under Tailwind v4's `--spacing-*` theme namespace: `--spacing-xs` (0.5rem) through `--spacing-2xl` (3rem), which generates real utilities — `p-xs`, `gap-lg`, `px-2xl`, etc., alongside Tailwind's normal numeric spacing scale. Use the named scale for **page-shell and section-level** spacing (outer page padding, gaps between major cards/sections) so "how much breathing room a page gets" is one decision, not one per page. Component-internal spacing (padding inside a button, gap between an icon and its label) should keep using ordinary numeric Tailwind spacing utilities (`p-2`, `gap-1.5`) as it does today — that's already consistent via `button.tsx`'s `cva` variants.

## Desktop / tablet / mobile consistency

No new breakpoint scale — Tailwind's defaults (`sm`/`md`/`lg`/`xl`) are sufficient and already used throughout. The actual layout inconsistency found in the last verification pass (`/dashboard`'s mobile-card-with-bottom-nav layout vs. `/dashboard-v2`'s sidebar layout, both live at desktop width) is **not** a design-token problem — it's two different page implementations for the same route concept. This design system doesn't resolve that; it's a routing/IA decision, flagged again here so it isn't lost.

## Adoption status — read this before assuming a page is "on the system"

This pass built the **tokens and primitives**. It did **not** rewrite the ~180 existing page/component files that currently hardcode raw Tailwind colors (`bg-emerald-600`, `bg-slate-50`, `bg-amber-100`, etc. — confirmed via grep, hundreds of occurrences) to use the new tokens/components instead. That's a real, separate migration — mechanical but large, worth doing incrementally (e.g. one page/feature area at a time) rather than as one sweeping change. The tokens are additive and back-compatible: nothing existing broke by introducing them, and every new page built from today onward should use `bg-primary`/`Badge`/`Card`/`Input` rather than picking a new raw color.
