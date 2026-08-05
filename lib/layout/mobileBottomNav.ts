/**
 * Single source of truth for "is the mobile bottom nav on screen?".
 *
 * Three places have to agree on this and they are in different files:
 *   1. MobileBottomNav       — whether to render at all
 *   2. AppLayout's <main>    — the `pb-24` that keeps content clear of it
 *   3. EstimateForm's sticky action bar — its `bottom-[65px]` offset
 *
 * If any one of them disagrees you get a visible bug: a sticky bar
 * floating 65px above the bottom of the screen over empty space, or
 * content hidden underneath the nav. Hence one predicate, imported.
 *
 * Edit screens hide it deliberately. They are focused, full-screen
 * tasks with their own sticky Save/Cancel bar; a second fixed bar below
 * that one costs 65px of an already short phone viewport and invites a
 * mis-tap that navigates away mid-edit, losing unsaved changes.
 *
 * Note this is a MOBILE-only concern — the nav is `lg:hidden`, so on
 * desktop nothing here changes anything.
 */
export function hidesMobileBottomNav(pathname: string | null): boolean {
  return pathname?.endsWith("/edit") ?? false;
}
