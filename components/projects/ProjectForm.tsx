"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ClientForm } from "@/components/clients/ClientForm";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";

/** Shared by the Create and Edit project pages — all data access goes
 * through useServices().projectService/clientService, no direct
 * database calls here.
 *
 * `onCreated`/`onCancel` let a caller (e.g. an inline "Add New Project"
 * dialog embedded in another form) reuse this exact same form/
 * validation/service call without the page-navigation side effects
 * (`router.push`/`router.back`) that the standalone /projects/new and
 * /projects/[id]/edit pages rely on. When omitted, behavior is
 * byte-for-byte unchanged from before these props existed. */
export function ProjectForm({
  project,
  defaultClientId,
  onCreated,
  onCancel,
}: {
  project?: Project;
  defaultClientId?: string;
  onCreated?: (project: Project) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const { projectService, clientService } = useServices();
  const { profile } = useAuth();

  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState(project?.name ?? "");
  const [clientId, setClientId] = useState(project?.clientId ?? defaultClientId ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [address, setAddress] = useState(project?.address ?? "");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [endDate, setEndDate] = useState(project?.endDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewClientModal, setShowNewClientModal] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    clientService.list({ companyId: profile.companyId }).then(setClients);
  }, [clientService, profile?.companyId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.companyId) return;
    setSaving(true);
    setError(null);
    try {
      if (project) {
        await projectService.update(project.id, {
          name,
          clientId: clientId || null,
          description: description || null,
          address: address || null,
          startDate: startDate || null,
          endDate: endDate || null,
        });
        if (onCreated) {
          // The edit-path branch above still ran the update; onCreated
          // callers only ever pass an unset `project`, so this is
          // unreachable for them — kept for type-safety only.
        } else {
          router.push(`/projects/${project.id}`);
          router.refresh();
        }
      } else {
        const created = await projectService.create({
          companyId: profile.companyId,
          clientId: clientId || null,
          name,
          description: description || undefined,
          address: address || undefined,
        });
        if (onCreated) {
          onCreated(created);
        } else {
          router.push(`/projects/${created.id}`);
          router.refresh();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Project name *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Client</label>
        <div className="flex items-center gap-2">
          <select
            value={clientId ?? ""}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {/* Same inline-create pattern EstimateForm already uses for
              its own Client field — creating one here must not lose the
              half-filled project form to a navigation. */}
          <button
            type="button"
            onClick={() => setShowNewClientModal(true)}
            className="shrink-0 whitespace-nowrap rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            + New Client
          </button>
        </div>
        {clients.length === 0 && <p className="text-xs text-muted-foreground">No clients yet — add one with &ldquo;+ New Client&rdquo;.</p>}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Address / Location</label>
        <input
          value={address ?? ""}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Notes / Description</label>
        <textarea
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Start date</label>
          <input type="date" value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">End date</label>
          <input type="date" value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel ?? (() => router.back())} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Saving…" : project ? "Save changes" : "Create project"}
        </button>
      </div>
    </form>

    <Modal open={showNewClientModal} onClose={() => setShowNewClientModal(false)} title="New Client">
      <ClientForm
        client={null}
        companyId={profile?.companyId ?? ""}
        onClose={() => setShowNewClientModal(false)}
        onSaved={(created) => {
          // Refresh the dropdown and auto-select the new client — the
          // created record comes straight back from ClientForm's
          // onSaved, so no refetch-and-guess is needed.
          setClients((prev) => [...prev, created]);
          setClientId(created.id);
          setShowNewClientModal(false);
        }}
      />
    </Modal>
    </>
  );
}
