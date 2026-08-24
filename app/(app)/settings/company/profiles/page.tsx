"use client";

/**
 * Business Profiles — manages `company_profiles`, the customer-facing
 * brand identities a company can present as on an estimate/invoice
 * (e.g. "One Square Roofing" vs "OSRPros") without duplicating the
 * company, financial data, or any calculation. See
 * supabase/migrations/20260821010000_company_profiles.sql's header for
 * the full model, and CompanyProfileService for the read/write path.
 *
 * Deliberately NOT a copy of Company Settings' full field set — only
 * what actually varies by brand (name/logo/phone/email/website/
 * address/footer). tax_id/license/terms/warranty stay company-wide and
 * have no equivalent here.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { usePermission } from "@/lib/hooks/usePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { CompanyProfile } from "@/lib/services/companyProfileService";
import { validatePortalDomain } from "@/lib/portalDomainValidation";

const FIELD = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";
const LABEL = "mb-1 block text-xs font-medium text-foreground";

type ProfileFormState = {
  companyName: string;
  logoUrl: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  companyAddress: string;
  footerMessage: string;
  portalDomain: string;
};

const EMPTY_FORM: ProfileFormState = {
  companyName: "",
  logoUrl: "",
  companyPhone: "",
  companyEmail: "",
  companyWebsite: "",
  companyAddress: "",
  footerMessage: "",
  portalDomain: "",
};

function profileToForm(p: CompanyProfile): ProfileFormState {
  return {
    companyName: p.companyName,
    logoUrl: p.logoUrl ?? "",
    companyPhone: p.companyPhone ?? "",
    companyEmail: p.companyEmail ?? "",
    companyWebsite: p.companyWebsite ?? "",
    companyAddress: p.companyAddress ?? "",
    footerMessage: p.footerMessage ?? "",
    portalDomain: p.portalDomain ?? "",
  };
}

function BusinessProfilesContent() {
  const { companyProfileService } = useServices();
  const { profile: authProfile } = useAuth();
  const canEdit = usePermission("company_settings", "update");
  const companyId = authProfile?.companyId ?? null;

  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<CompanyProfile | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      setProfiles(await companyProfileService.listForCompany(companyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load business profiles.");
    } finally {
      setLoading(false);
    }
  }, [companyProfileService, companyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setEditorOpen(true);
  }

  function openEdit(p: CompanyProfile) {
    setEditingId(p.id);
    setForm(profileToForm(p));
    setError(null);
    setEditorOpen(true);
  }

  const domainCheck = validatePortalDomain(form.portalDomain);

  async function handleSave() {
    if (!companyId || !form.companyName.trim()) return;
    if (!domainCheck.valid) {
      setError(domainCheck.message ?? "Invalid portal domain.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        companyName: form.companyName.trim(),
        logoUrl: form.logoUrl.trim() || null,
        companyPhone: form.companyPhone.trim() || null,
        companyEmail: form.companyEmail.trim() || null,
        companyWebsite: form.companyWebsite.trim() || null,
        companyAddress: form.companyAddress.trim() || null,
        footerMessage: form.footerMessage.trim() || null,
        portalDomain: domainCheck.normalized ?? null,
      };
      if (editingId) {
        await companyProfileService.update(editingId, payload);
      } else {
        await companyProfileService.create({ companyId, ...payload });
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save business profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting || !deleteReason.trim()) return;
    setBusyId(deleting.id);
    setError(null);
    try {
      await companyProfileService.softDelete(deleting.id, deleteReason.trim());
      setDeleting(null);
      setDeleteReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete business profile.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Business Profiles"
        description="Alternate customer-facing brands (name, logo, contact info) this company can present as on an estimate or invoice. The legal company and its financials never change — only what the customer sees."
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="size-3.5" /> New Profile
              </button>
            )}
            <Link href="/settings/company" className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              <ArrowLeft className="size-3.5" /> Company Settings
            </Link>
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : profiles.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No business profiles yet"
          description="Every estimate/invoice uses your company's own default identity until you create one. Add a profile to let a specific estimate present under a different name."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Phone</th>
                <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Email</th>
                <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">Portal Domain</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {profiles.map((p) => (
                <tr key={p.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2.5 font-medium text-foreground">{p.companyName}</td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground sm:table-cell">{p.companyPhone ?? "—"}</td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{p.companyEmail ?? "—"}</td>
                  <td className="hidden px-3 py-2.5 lg:table-cell">
                    {p.portalDomain ? (
                      <span className="text-foreground">{p.portalDomain}</span>
                    ) : (
                      <span className="text-muted-foreground">Uses the default domain</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <>
                          <button type="button" onClick={() => openEdit(p)} aria-label="Edit" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                            <Pencil className="size-3.5" />
                          </button>
                          <button type="button" onClick={() => setDeleting(p)} aria-label="Delete" className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editingId ? "Edit Business Profile" : "New Business Profile"}>
        <div className="space-y-3">
          <div>
            <label className={LABEL}>Business Name *</label>
            <input
              autoFocus
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              placeholder="e.g. OSRPros"
              className={FIELD}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Phone</label>
              <input value={form.companyPhone} onChange={(e) => setForm((f) => ({ ...f, companyPhone: e.target.value }))} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>Email</label>
              <input value={form.companyEmail} onChange={(e) => setForm((f) => ({ ...f, companyEmail: e.target.value }))} className={FIELD} />
            </div>
          </div>
          <div>
            <label className={LABEL}>Website</label>
            <input value={form.companyWebsite} onChange={(e) => setForm((f) => ({ ...f, companyWebsite: e.target.value }))} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Address</label>
            <input value={form.companyAddress} onChange={(e) => setForm((f) => ({ ...f, companyAddress: e.target.value }))} className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Logo URL</label>
            <input value={form.logoUrl} onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))} placeholder="https://…" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Footer Message</label>
            <input value={form.footerMessage} onChange={(e) => setForm((f) => ({ ...f, footerMessage: e.target.value }))} placeholder="Thank you for your business!" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Portal Domain</label>
            <input
              value={form.portalDomain}
              onChange={(e) => setForm((f) => ({ ...f, portalDomain: e.target.value }))}
              placeholder="https://osrpros.com"
              className={FIELD}
            />
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
              Where a customer lands when they open an estimate/invoice using this profile — e.g. https://osrpros.com. Leave blank to use the default domain instead.
            </p>
            {form.portalDomain.trim() && !domainCheck.valid && (
              <p className="mt-1 text-[10.5px] text-danger">{domainCheck.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setEditorOpen(false)} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !form.companyName.trim() || !domainCheck.valid}
              onClick={handleSave}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={deleting != null} onClose={() => { setDeleting(null); setDeleteReason(""); }} title="Delete this profile?">
        {deleting && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Delete <span className="font-medium">{deleting.companyName}</span>? Any estimate/invoice already using it keeps its own copy of these details unaffected — this can be restored later if needed.
            </p>
            <div>
              <label className={LABEL}>Reason (required)</label>
              <input
                autoFocus
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. No longer used"
                className={FIELD}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setDeleting(null); setDeleteReason(""); }} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
                Cancel
              </button>
              <button
                type="button"
                disabled={!deleteReason.trim() || busyId === deleting.id}
                onClick={handleDelete}
                className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-danger-foreground hover:bg-danger/90 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}

export default function BusinessProfilesPage() {
  return (
    <RequirePermission resource="company_settings" action="view">
      <BusinessProfilesContent />
    </RequirePermission>
  );
}
