"use client";

/**
 * Shared Create/Edit client form — extracted from app/(app)/clients/page.tsx
 * (previously a private, unexported function there) so other pages
 * (e.g. EstimateForm's inline "+ Add New Client") can reuse the exact
 * same form/validation/service call instead of duplicating it, the
 * same way components/projects/ProjectForm.tsx was extracted earlier
 * for "+ Add New Project".
 */
import { useState } from "react";
import { useServices } from "@/components/providers/ServicesProvider";
import type { Client } from "@/lib/services/clientService";

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

export function ClientForm({
  client,
  companyId,
  onClose,
  onSaved,
}: {
  client: Client | null;
  companyId: string;
  onClose: () => void;
  /** Receives the created/updated client — callers that need the new
   * client's id (e.g. to auto-select it) can read it straight off this,
   * no separate refetch-and-guess required. */
  onSaved: (client: Client) => void;
}) {
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
      const saved = client
        ? await clientService.update(client.id, { name, email: email || null, phone: phone || null, address: address || null })
        : await clientService.create({ companyId, name, email: email || null, phone: phone || null, address: address || null });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save client.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
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
