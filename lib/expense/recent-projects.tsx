// Client-side "recent projects" and "smart defaults" storage.
//
// Deliberately NOT in the database — no existing table has a spot for
// it, and it's not worth a new column for a pure speed shortcut.
// Everything here is per-browser, which is fine for "recently
// accessed" and is actually the right behavior for "remember the last
// selected project during the current session."

const RECENTS_KEY = "project-expense:recent-project-ids";
const LAST_SELECTED_KEY = "project-expense:last-selected-project-id";
const LAST_PAYMENT_METHOD_KEY = "project-expense:last-payment-method";
const LAST_CATEGORY_KEY = "project-expense:last-category";
const MAX_RECENTS = 5;

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function readValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

/** Returns up to MAX_RECENTS project ids, most-recent first. */
export function getRecentProjectIds(): string[] {
  return readList(RECENTS_KEY).slice(0, MAX_RECENTS);
}

/** Call whenever a project is opened — bumps it to the front of the
 * recents list and remembers it as the last-selected project for
 * this session. */
export function recordProjectAccess(projectId: string): void {
  if (typeof window === "undefined") return;
  const existing = readList(RECENTS_KEY).filter((id) => id !== projectId);
  const updated = [projectId, ...existing].slice(0, MAX_RECENTS);
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  window.sessionStorage.setItem(LAST_SELECTED_KEY, projectId);
}

/** The project selected earlier in this browser tab/session, if any
 * — used to skip project selection entirely on return visits within
 * the same session. */
export function getLastSelectedProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(LAST_SELECTED_KEY);
}

export function getLastPaymentMethod(): string | null {
  return readValue(LAST_PAYMENT_METHOD_KEY);
}

export function setLastPaymentMethod(method: string): void {
  window.localStorage.setItem(LAST_PAYMENT_METHOD_KEY, method);
}

export function getLastCategory(): string | null {
  return readValue(LAST_CATEGORY_KEY);
}

export function setLastCategory(category: string): void {
  window.localStorage.setItem(LAST_CATEGORY_KEY, category);
}