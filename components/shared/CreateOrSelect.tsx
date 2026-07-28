"use client";

/**
 * Searchable "pick one, or make a new one" combobox.
 *
 * Deliberately generic and directory-driven: it knows nothing about
 * subcontractors, agents or vendors. Each caller supplies a
 * `DirectoryAdapter` describing how to search and how to create. That's
 * what lets the Expense form use the SAME control for all three kinds of
 * payee instead of three near-identical dropdowns, and what lets a real
 * Vendor module later replace the vendor adapter without this file or
 * the expense form changing at all.
 *
 * THE THING THAT MATTERS MOST HERE: creating a new record must not cost
 * the user the form they were filling in. The inline create renders as
 * an overlay ON TOP of the form — the form stays mounted, so its state
 * is untouched — and on success the new record is auto-selected and the
 * overlay closes. Nothing is unmounted, nothing is re-fetched, no draft
 * is lost.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";

export interface DirectoryOption {
  /** Null for adapters with no backing table — the vendor adapter
   * returns free-text names, which have a label but no id. */
  id: string | null;
  label: string;
  /** Optional second line (trade, email, commission rate…). */
  hint?: string;
}

export interface DirectoryAdapter {
  /** Shown as the field label and used in the empty/create copy. */
  noun: string;
  search(query: string): Promise<DirectoryOption[]>;
  /** Absent => this directory is read-only and the "create" affordance
   * is hidden. Used for gracefully degrading when a module that would
   * own the records doesn't exist yet. */
  create?(input: { name: string }): Promise<DirectoryOption>;
  /** Extra fields the inline create form should collect, beyond name. */
  createFields?: Array<{ key: string; label: string; type?: "text" | "email" | "tel" | "number"; required?: boolean }>;
  createWithFields?(input: Record<string, string>): Promise<DirectoryOption>;
}

export function CreateOrSelect({
  adapter,
  value,
  valueLabel,
  onChange,
  placeholder,
  disabled,
}: {
  adapter: DirectoryAdapter;
  value: string | null;
  /** Rendered when a selection exists — avoids showing a bare uuid
   * while the directory list is still loading. */
  valueLabel?: string | null;
  onChange: (option: DirectoryOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<DirectoryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    adapter
      .search(query)
      .then((rows) => {
        if (!cancelled) setOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, query, open]);

  // Close on outside click. Not on blur — blur fires when the user
  // clicks the "create" button inside the panel, which would close the
  // panel out from under them.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const exactMatch = useMemo(
    () => options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()),
    [options, query]
  );
  const canCreate = !!(adapter.create || adapter.createWithFields) && query.trim().length > 0 && !exactMatch;

  const display = valueLabel ?? null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50"
      >
        <span className={display ? "truncate text-foreground" : "truncate text-muted-foreground"}>
          {display || placeholder || `Select ${adapter.noun.toLowerCase()}…`}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {display && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Clear ${adapter.noun.toLowerCase()}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onChange(null);
                }
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronDown className="size-4 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${adapter.noun.toLowerCase()}…`}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <ul id={listboxId} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {loading && <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>}
            {!loading && options.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                No {adapter.noun.toLowerCase()} found{query.trim() ? ` for “${query.trim()}”` : ""}.
              </li>
            )}
            {options.map((option) => (
              <li key={option.id ?? option.label}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === option.id}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{option.label}</span>
                    {option.hint && <span className="block truncate text-xs text-muted-foreground">{option.hint}</span>}
                  </span>
                  {value !== null && value === option.id && <Check className="size-3.5 shrink-0 text-primary" />}
                </button>
              </li>
            ))}
          </ul>

          {canCreate && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
            >
              <Plus className="size-3.5" />
              Create “{query.trim()}”
            </button>
          )}
        </div>
      )}

      {creating && (
        <InlineCreate
          adapter={adapter}
          initialName={query.trim()}
          onCancel={() => setCreating(false)}
          onCreated={(option) => {
            // Auto-select and return to the form. The expense form was
            // never unmounted, so everything already typed is still there.
            onChange(option);
            setCreating(false);
            setOpen(false);
            setQuery("");
          }}
        />
      )}
    </div>
  );
}

/** The inline create sheet. Rendered as a fixed overlay so it sits on
 * top of whatever form opened it rather than replacing it. */
function InlineCreate({
  adapter,
  initialName,
  onCancel,
  onCreated,
}: {
  adapter: DirectoryAdapter;
  initialName: string;
  onCancel: () => void;
  onCreated: (option: DirectoryOption) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({ name: initialName });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extraFields = adapter.createFields ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // BOTH are required, and the second is the non-obvious one.
    // React events propagate along the REACT tree, not the DOM tree, so
    // portalling this overlay out to <body> stops the invalid HTML
    // nesting but does NOT stop this submit from bubbling up into the
    // expense form's own onSubmit. Without stopPropagation, creating a
    // subcontractor silently submitted the half-filled expense behind
    // it — observed live: the dialog closed and a stray expense was
    // written the moment "Create subcontractor" was clicked.
    e.stopPropagation();
    if (!values.name?.trim()) {
      setError(`A ${adapter.noun.toLowerCase()} name is required.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = adapter.createWithFields
        ? await adapter.createWithFields(values)
        : await adapter.create!({ name: values.name.trim() });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not create this ${adapter.noun.toLowerCase()}.`);
      setSaving(false);
    }
  }

  // PORTALLED TO <body> ON PURPOSE. This control is rendered inside the
  // caller's <form> (the expense dialog), and a <form> nested inside
  // another <form> is invalid HTML: the browser hoists it out, and the
  // inner submit button ends up submitting the OUTER form. That fired a
  // native GET navigation the first time this was used live — the page
  // reloaded and everything typed into the expense form was lost, which
  // is the exact failure this component exists to prevent.
  //
  // A portal moves only the DOM node; the component stays where it is in
  // the React tree, so the expense form above it is never unmounted and
  // its state survives untouched.
  const overlay = (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-border bg-card p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">New {adapter.noun}</h3>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Name *</label>
            <input
              autoFocus
              value={values.name ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
          </div>

          {extraFields.map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                {field.label}
                {field.required ? " *" : ""}
              </label>
              <input
                type={field.type ?? "text"}
                required={field.required}
                value={values[field.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
              />
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-input px-3 text-sm font-medium text-foreground hover:bg-muted">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : `Create ${adapter.noun.toLowerCase()}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // During SSR there is no document to portal into.
  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
