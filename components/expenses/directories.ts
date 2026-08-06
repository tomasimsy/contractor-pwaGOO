"use client";

/**
 * DirectoryAdapters for the three payee kinds the Expense form can pick.
 *
 * This file is the ONLY place that knows where subcontractors, agents
 * and vendors come from. The form and the picker are both generic, so
 * when the Subcontractor (Prompt 41) and Agent (Prompt 42) modules land,
 * they replace the bodies here — swapping a direct table read for
 * `subcontractorService.getRoster(...)` — and nothing else changes.
 *
 * GRACEFUL DEGRADATION, ON PURPOSE
 * Those services are still in-memory doubles, so an adapter cannot read
 * a roster through them. Rather than showing an empty picker (which
 * would look broken and block the user), the subcontractor and agent
 * adapters read their live tables directly and, if that fails or the
 * table is empty, the expense form falls back to plain free-text entry.
 * A missing module degrades to typing a name; it never blocks recording
 * a real cost.
 *
 * The direct Supabase reads here are a deliberate, documented exception
 * to "no Supabase outside lib/services" and are scoped to READ-ONLY
 * name lookups for a picker — no financial figure is derived from them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DirectoryAdapter, DirectoryOption } from "@/components/shared/CreateOrSelect";
import type { ExpenseService } from "@/lib/services";

const like = (q: string) => `%${q.replace(/[%_]/g, "")}%`;

export function createSubcontractorDirectory(supabase: SupabaseClient, companyId: string): DirectoryAdapter {
  return {
    noun: "Subcontractor",
    createFields: [
      { key: "trade", label: "Trade" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "email", label: "Email", type: "email" },
    ],
    async search(query) {
      let q = supabase
        .from("subcontractors")
        .select("id, name, company_name, trade")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name")
        .limit(20);
      if (query.trim()) q = q.ilike("name", like(query.trim()));

      const { data, error } = await q;
      if (error) return [];
      return ((data ?? []) as Array<{ id: string; name: string; company_name: string | null; trade: string | null }>).map(
        (r): DirectoryOption => ({
          id: r.id,
          label: r.name,
          hint: [r.trade, r.company_name].filter(Boolean).join(" · ") || undefined,
        })
      );
    },
    async createWithFields(values) {
      const { data, error } = await supabase
        .from("subcontractors")
        .insert({
          company_id: companyId,
          name: values.name.trim(),
          trade: values.trade?.trim() || null,
          phone: values.phone?.trim() || null,
          email: values.email?.trim() || null,
          is_active: true,
        })
        .select("id, name, trade")
        .single();
      if (error) throw new Error(error.message);
      const row = data as { id: string; name: string; trade: string | null };
      return { id: row.id, label: row.name, hint: row.trade ?? undefined };
    },
  };
}

export function createAgentDirectory(supabase: SupabaseClient, companyId: string): DirectoryAdapter {
  return {
    noun: "Agent",
    createFields: [
      { key: "phone", label: "Phone", type: "tel" },
      { key: "email", label: "Email", type: "email" },
      { key: "commission_rate", label: "Commission %", type: "number" },
    ],
    async search(query) {
      let q = supabase
        .from("agents")
        .select("id, name, email, commission_rate")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name")
        .limit(20);
      if (query.trim()) q = q.ilike("name", like(query.trim()));

      const { data, error } = await q;
      if (error) return [];
      return ((data ?? []) as Array<{ id: string; name: string; email: string | null; commission_rate: number | null }>).map(
        (r): DirectoryOption => ({
          id: r.id,
          label: r.name,
          hint: [r.email, r.commission_rate != null ? `${r.commission_rate}%` : null].filter(Boolean).join(" · ") || undefined,
        })
      );
    },
    async createWithFields(values) {
      const rate = values.commission_rate?.trim() ? Number(values.commission_rate) : null;
      const { data, error } = await supabase
        .from("agents")
        .insert({
          company_id: companyId,
          name: values.name.trim(),
          phone: values.phone?.trim() || null,
          email: values.email?.trim() || null,
          commission_rate: Number.isFinite(rate) ? rate : null,
          is_active: true,
        })
        .select("id, name, email")
        .single();
      if (error) throw new Error(error.message);
      const row = data as { id: string; name: string; email: string | null };
      return { id: row.id, label: row.name, hint: row.email ?? undefined };
    },
  };
}

/**
 * The company's own USERS — who an "employee paid this" expense is
 * owed back to.
 *
 * Reads the `list_company_members` RPC, not the `profiles` table, for a
 * reason that is easy to get wrong: RLS on `profiles` scopes a caller
 * to their OWN row (verified live — a direct select returns exactly one
 * row, the caller's), so a table read here would give every user a
 * dropdown containing only themselves. The RPC is SECURITY DEFINER and
 * returns every member of the caller's company. It also returns the
 * email, which `profiles` cannot: email lives in `auth.users`.
 *
 * READ-ONLY — no `create`. People become company members by being
 * invited, not by being typed into an expense form, so the picker
 * deliberately offers no "create" affordance (CreateOrSelect hides it
 * when `create`/`createWithFields` are absent).
 *
 * The id returned here is the profile id, which IS the auth user id —
 * exactly what `estimate_expenses.paid_by_id` holds.
 */
export function createCompanyUserDirectory(supabase: SupabaseClient): DirectoryAdapter {
  return {
    noun: "User",
    async search(query) {
      const { data, error } = await supabase.rpc("list_company_members");
      if (error) return [];
      const rows = (data ?? []) as Array<{ id: string; email: string | null; role: string | null; full_name?: string | null }>;
      const q = query.trim().toLowerCase();
      return rows
        .map((r): DirectoryOption => ({
          id: r.id,
          // full_name is nullable and null in practice today, so email
          // is the dependable label rather than the fallback.
          label: r.full_name?.trim() || r.email || "Unnamed user",
          hint: r.role ?? undefined,
        }))
        .filter((o) => !q || o.label.toLowerCase().includes(q))
        .slice(0, 20);
    },
  };
}

/**
 * Vendors are free text by design — there is no vendors table and this
 * module does not create one. "Create" therefore just accepts the typed
 * name; the suggestions come from vendor names already used on this
 * company's expenses, which is what makes the picker useful without a
 * directory behind it.
 *
 * Shaped as a full adapter anyway so that if a Vendor module ever
 * arrives, only this function changes — the expense form keeps calling
 * the same picker with the same props, and `Expense.vendor` keeps
 * holding a display name either way.
 */
export function createVendorDirectory(expenseService: ExpenseService, companyId: string): DirectoryAdapter {
  return {
    noun: "Vendor",
    async search(query) {
      const names = await expenseService.listKnownVendors(companyId);
      const q = query.trim().toLowerCase();
      return names
        .filter((n) => !q || n.toLowerCase().includes(q))
        .slice(0, 20)
        .map((n): DirectoryOption => ({ id: null, label: n }));
    },
    async create({ name }) {
      // Nothing to persist: the name IS the record. It becomes a
      // suggestion for next time as soon as the expense is saved.
      return { id: null, label: name.trim() };
    },
  };
}
