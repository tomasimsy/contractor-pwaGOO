"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";

/** Shared by the Create and Edit project pages — all data access goes
 * through useServices().projectService/clientService, no direct
 * database calls here. */
export function ProjectForm({ project, defaultClientId }: { project?: Project; defaultClientId?: string }) {
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
        router.push(`/projects/${project.id}`);
      } else {
        const created = await projectService.create({
          companyId: profile.companyId,
          clientId: clientId || null,
          name,
          description: description || undefined,
          address: address || undefined,
        });
        router.push(`/projects/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project.");
    } finally {
      setSaving(false);
    }
  }

  return (
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
        {clients.length === 0 && <p className="text-xs text-muted-foreground">No clients yet — <Link href="/clients" className="text-primary hover:underline">create one first</Link>.</p>}
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
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Saving…" : project ? "Save changes" : "Create project"}
        </button>
      </div>
    </form>
  );
}
