"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Client } from "@/lib/services/clientService";

/**
 * Real CRUD against the Supabase-backed ClientService — no direct
 * database calls from this page; every read/write goes through
 * useServices().clientService, per the architecture requirement.
 */
export default function ClientsPage() {
  const { clientService } = useServices();
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<Client | "new" | null>(null);

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await clientService.list({ companyId: profile.companyId });
      setClients(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clients.");
    } finally {
      setLoading(false);
    }
    // See projects/page.tsx's identical load() for why this depends on
    // the whole `profile` object, not profile?.companyId.
  }, [clientService, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(client: Client) {
    const reason = window.prompt(`Why are you deleting "${client.name}"?`);
    if (!reason) return;
    try {
      await clientService.softDelete(client.id, reason);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete client.");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Clients"
        description="Every project needs a client to attach to."
        actions={
          <button type="button" onClick={() => setShowForm("new")} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> New Client
          </button>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {showForm && (
        <ClientForm
          client={showForm === "new" ? null : showForm}
          companyId={profile?.companyId ?? ""}
          onClose={() => setShowForm(null)}
          onSaved={async () => {
            setShowForm(null);
            await load();
          }}
        />
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : clients.length === 0 ? (
        <EmptyState icon={Users} title="No clients yet" description="Add your first client to start creating projects." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Email</th>
                <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Phone</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2.5">
                    <Link href={`/clients/${client.id}`} className="font-medium text-foreground hover:text-primary">
                      {client.name}
                    </Link>
                    {client.address && <div className="text-xs text-muted-foreground">{client.address}</div>}
                  </td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground sm:table-cell">{client.email ?? "—"}</td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{client.phone ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => setShowForm(client)} aria-label={`Edit ${client.name}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Pencil className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => handleDelete(client)} aria-label={`Delete ${client.name}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}

function ClientForm({ client, companyId, onClose, onSaved }: { client: Client | null; companyId: string; onClose: () => void; onSaved: () => void }) {
  const { clientService } = useServices();
  const [name, setName] = useState(client?.name ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [address, setAddress] = useState(client?.address ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (client) {
        await clientService.update(client.id, { name, email: email || null, phone: phone || null, address: address || null });
      } else {
        await clientService.create({ companyId, name, email: email || null, phone: phone || null, address: address || null });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save client.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{client ? "Edit Client" : "New Client"}</h2>
        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" value={name} onChange={setName} required />
          <Field label="Email" value={email ?? ""} onChange={setEmail} type="email" />
          <Field label="Phone" value={phone ?? ""} onChange={setPhone} />
          <Field label="Address" value={address ?? ""} onChange={setAddress} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      />
    </div>
  );
}
