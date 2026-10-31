"use client";

/**
 * One subcontractor: paperwork, profile, and the jobs they're on.
 *
 * Paperwork is `subcontractor_documents` (files in the private
 * company-documents bucket, uploaded through
 * /api/subcontractor-documents/upload). What is missing or expired is
 * subcontractorCompliance — the same rule the roster and Payroll use.
 *
 * Jobs and money come from loadContractRows, the exact rows Payroll
 * shows, so "owed" here always matches Payroll. Paying is done there.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  SUB_ENTITY_TYPES,
  SUB_ENTITY_TYPE_LABEL,
  type SubEntityType,
  type Subcontractor,
  type SubcontractorProfile,
} from "@/lib/services/subcontractorService";
import {
  INSURANCE_DOCUMENT_TYPES,
  SUB_DOCUMENT_TYPES,
  SUB_DOCUMENT_TYPE_LABEL,
  subcontractorCompliance,
  type ComplianceItem,
  type SubDocumentType,
  type SubcontractorDocument,
} from "@/lib/services/subcontractorDocumentService";
import { loadContractRows, type SubRow } from "@/lib/services/subcontractorPayroll";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const shortDate = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const FIELD =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
const LABEL = "mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const SECTION = "text-[11px] font-semibold uppercase tracking-wide text-primary";

const STATE_TEXT: Record<ComplianceItem["state"], string> = {
  ok: "text-success",
  expiring: "text-warning",
  expired: "text-danger",
  missing: "text-danger",
  not_needed: "text-muted-foreground",
};

/** Which document type each compliance cell uploads when it is clicked. */
const UPLOAD_FOR: Record<ComplianceItem["key"], SubDocumentType> = {
  w9: "w9",
  general_liability: "general_liability",
  workers_comp: "workers_comp",
  license: "license",
  agreement: "agreement",
};

type ProfileDraft = Record<keyof SubcontractorProfile, string>;

function toDraft(s: Subcontractor): ProfileDraft {
  return {
    name: s.name,
    trade: s.trade ?? "",
    phone: s.phone ?? "",
    contactPerson: s.contactPerson ?? "",
    isActive: s.isActive ? "true" : "false",
    companyName: s.companyName ?? "",
    email: s.email ?? "",
    address: s.address ?? "",
    notes: s.notes ?? "",
    entityType: s.entityType ?? "",
    taxIdLast4: s.taxIdLast4 ?? "",
    licenseNumber: s.licenseNumber ?? "",
    licenseState: s.licenseState ?? "",
    paymentMethod: s.paymentMethod ?? "",
    payToName: s.payToName ?? "",
  };
}

const blankUpload = (docType: SubDocumentType = "w9") => ({
  docType,
  file: null as File | null,
  issuedDate: "",
  expirationDate: "",
  carrier: "",
  policyNumber: "",
  coverageAmount: "",
  additionalInsured: false,
  notes: "",
});

function SubcontractorDetail() {
  const params = useParams();
  const subId = params.id as string;
  const services = useServices();
  const { subcontractorService, subcontractorDocumentService } = services;
  const { profile } = useAuth();
  const companyId = profile?.companyId ?? null;

  const [sub, setSub] = useState<Subcontractor | null>(null);
  const [docs, setDocs] = useState<SubcontractorDocument[]>([]);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [row, setRow] = useState<SubRow | null>(null);
  const [estimateHref, setEstimateHref] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const [upload, setUpload] = useState<ReturnType<typeof blankUpload> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editDocId, setEditDocId] = useState<string | null>(null);
  const [docDraft, setDocDraft] = useState({ expirationDate: "", issuedDate: "", carrier: "", policyNumber: "", coverageAmount: "" });
  const [removeDocId, setRemoveDocId] = useState<string | null>(null);
  const [allJobs, setAllJobs] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const roster = await subcontractorService.getRoster(companyId, true);
      const found = roster.find((s) => s.id === subId) ?? null;
      setSub(found);
      if (!found) return;
      const [estimates, projects] = await Promise.all([
        services.estimateService.list({ companyId }),
        services.projectService.list({ companyId }),
      ]);
      const labels = new Map(estimates.map((e) => [e.id, [e.estimateNumber, e.title].filter(Boolean).join(" · ") || "Job"]));
      setEstimateHref(new Map(estimates.map((e) => [e.id, `${e.estimateType === "roofing" ? "/estimates-roof" : "/estimates"}/${e.id}`])));
      const projectNames = new Map(projects.map((p) => [p.id, p.name]));
      const labelFor = (id: string | null, projectId: string | null) =>
        id ? labels.get(id) ?? "Job" : projectId && projectNames.has(projectId) ? `Project · ${projectNames.get(projectId)}` : "Project";
      const rows = await loadContractRows(services, companyId, labelFor);
      setRow(rows.find((r) => r.key === `sub:${subId}`) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load this subcontractor.");
    } finally {
      setLoading(false);
    }
    try {
      setDocs(await subcontractorDocumentService.listForSubcontractor(subId));
      setDocsError(null);
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "Failed to load documents.");
    }
    // services is a stable context object; listing it would reload on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, subId, subcontractorService, subcontractorDocumentService]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const compliance = useMemo(() => (sub ? subcontractorCompliance(sub, docs) : null), [sub, docs]);

  async function saveProfile() {
    if (!sub || !draft) return;
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    const last4 = draft.taxIdLast4.replace(/\D/g, "");
    if (last4 && last4.length !== 4) {
      setError("Enter only the last 4 digits of the EIN or SSN.");
      return;
    }
    setSaving(true);
    setError(null);
    const t = (v: string) => v.trim() || null;
    try {
      const updated = await subcontractorService.updateSubcontractor(sub.id, {
        name: draft.name.trim(),
        trade: t(draft.trade),
        phone: t(draft.phone),
        contactPerson: t(draft.contactPerson),
        companyName: t(draft.companyName),
        email: t(draft.email),
        address: t(draft.address),
        notes: t(draft.notes),
        entityType: (draft.entityType || null) as SubEntityType | null,
        taxIdLast4: last4 || null,
        licenseNumber: t(draft.licenseNumber),
        licenseState: t(draft.licenseState)?.toUpperCase() ?? null,
        paymentMethod: t(draft.paymentMethod),
        payToName: t(draft.payToName),
      });
      setSub(updated);
      setEditing(false);
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!sub) return;
    try {
      setSub(await subcontractorService.updateSubcontractor(sub.id, { isActive: !sub.isActive }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    }
  }

  async function submitUpload() {
    if (!upload?.file || !sub) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", upload.file);
      form.set("subcontractorId", sub.id);
      form.set("docType", upload.docType);
      form.set("name", upload.file.name);
      if (upload.issuedDate) form.set("issuedDate", upload.issuedDate);
      if (upload.expirationDate) form.set("expirationDate", upload.expirationDate);
      if (INSURANCE_DOCUMENT_TYPES.has(upload.docType)) {
        if (upload.carrier) form.set("carrier", upload.carrier);
        if (upload.policyNumber) form.set("policyNumber", upload.policyNumber);
        if (upload.coverageAmount) form.set("coverageAmount", upload.coverageAmount);
        form.set("additionalInsured", upload.additionalInsured ? "true" : "false");
      }
      if (upload.notes) form.set("notes", upload.notes);
      const res = await fetch("/api/subcontractor-documents/upload", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Upload failed.");
      setUpload(null);
      setNotice(`${SUB_DOCUMENT_TYPE_LABEL[upload.docType]} uploaded.`);
      setDocs(await subcontractorDocumentService.listForSubcontractor(sub.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function saveDoc(doc: SubcontractorDocument) {
    try {
      await subcontractorDocumentService.update(doc.id, {
        issuedDate: docDraft.issuedDate || null,
        expirationDate: docDraft.expirationDate || null,
        ...(INSURANCE_DOCUMENT_TYPES.has(doc.docType)
          ? {
              carrier: docDraft.carrier.trim() || null,
              policyNumber: docDraft.policyNumber.trim() || null,
              coverageAmount: Number(docDraft.coverageAmount) || null,
            }
          : {}),
      });
      setEditDocId(null);
      setDocs(await subcontractorDocumentService.listForSubcontractor(subId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the document.");
    }
  }

  async function removeDoc(doc: SubcontractorDocument) {
    try {
      await subcontractorDocumentService.softDelete(doc.id, "Removed from subcontractor file");
      setRemoveDocId(null);
      setDocs(await subcontractorDocumentService.listForSubcontractor(subId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the document.");
    }
  }

  if (loading && !sub) {
    return <div className="py-12 text-center text-[13px] text-muted-foreground">Loading…</div>;
  }
  if (!sub) {
    return (
      <div className="py-12 text-center text-[13px] text-muted-foreground">
        Subcontractor not found. <Link href="/subcontractors" className="text-primary hover:underline">Back to subcontractors</Link>
      </div>
    );
  }

  const owedLines = (row?.lines ?? []).filter((l) => l.outstanding > 0.005);
  /** Unpaid jobs always show; paid ones only up to a handful unless expanded. */
  const JOBS_SHOWN = 6;
  const jobLines = allJobs
    ? row?.lines ?? []
    : [...owedLines, ...(row?.lines ?? []).filter((l) => l.outstanding <= 0.005).slice(0, Math.max(0, JOBS_SHOWN - owedLines.length))];
  const hiddenJobs = (row?.lines.length ?? 0) - jobLines.length;
  const jobHref = (estimateId: string | null, projectId: string) => (estimateId ? estimateHref.get(estimateId) : `/projects/${projectId}`);
  const sortedDocs = [...docs].sort(
    (a, b) => SUB_DOCUMENT_TYPES.indexOf(a.docType) - SUB_DOCUMENT_TYPES.indexOf(b.docType) || b.createdAt.localeCompare(a.createdAt)
  );
  /** Older copies of a document type — kept, but shown muted. */
  const current = new Set(
    compliance
      ? sortedDocs
          .filter((d) => {
            const sameType = sortedDocs.filter((x) => x.docType === d.docType);
            const best = sameType.reduce((a, b) =>
              (b.expirationDate ?? "9999") > (a.expirationDate ?? "9999") || ((b.expirationDate ?? "9999") === (a.expirationDate ?? "9999") && b.createdAt > a.createdAt) ? b : a
            );
            return best.id === d.id;
          })
          .map((d) => d.id)
      : []
  );

  const field = (key: keyof SubcontractorProfile, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input value={draft?.[key] ?? ""} onChange={(e) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d))} className={FIELD} {...props} />
    </label>
  );
  const dd = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 py-1">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-[13px] text-foreground">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );

  return (
    <PageContainer className="sm:px-0 sm:py-0 lg:px-0">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-baseline gap-x-2 text-xl font-semibold tracking-tight text-foreground">
              {sub.name}
              {!sub.isActive && <span className="text-[12px] font-medium text-muted-foreground">Inactive</span>}
            </h1>
            <p className="text-[12px] text-muted-foreground">
              {[sub.trade, sub.contactPerson, sub.phone, sub.email].filter(Boolean).join(" · ") || "No contact details yet"}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[13px]">
            <button type="button" onClick={toggleActive} className="text-muted-foreground hover:text-foreground">
              {sub.isActive ? "Deactivate" : "Reactivate"}
            </button>
            <Link href={`/payroll?person=sub:${sub.id}`} className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90">
              {row && row.owed > 0 ? `Pay ${money(row.owed)} in Payroll →` : "Open in Payroll →"}
            </Link>
          </div>
        </div>

        {/* Paperwork at a glance: one ruled strip, a cell per required document. */}
        {compliance && !docsError && (
          <div className="grid grid-cols-2 rounded-lg border border-border bg-card sm:grid-cols-6">
            {compliance.items.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => setUpload(blankUpload(UPLOAD_FOR[i.key]))}
                title={i.state === "ok" ? "Upload a newer copy" : "Upload"}
                className="border-b border-r border-border px-3 py-2 text-left hover:bg-muted/40 sm:border-b-0"
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{i.label}</div>
                <div className={`mt-0.5 text-[13px] font-semibold ${STATE_TEXT[i.state]}`}>
                  {i.state === "not_needed" ? "Not tracked" : i.detail}
                </div>
              </button>
            ))}
            <div className="px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">1099</div>
              <div className="mt-0.5 text-[13px] font-semibold text-foreground">
                {compliance.needs1099 == null ? <span className="text-muted-foreground">Set entity type</span> : compliance.needs1099 ? "Required" : "Not usually (corp)"}
              </div>
            </div>
          </div>
        )}

        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
        {notice && <div className="rounded-lg bg-success/10 px-3 py-2 text-[13px] text-success">{notice}</div>}
        {docsError && (
          <div className="rounded-lg bg-warning/10 px-3 py-2 text-[13px] text-warning">
            Documents aren&apos;t available yet: run migration 20261029020000_subcontractor_profile_and_documents.sql in Supabase.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          {/* ---------------- Documents ---------------- */}
          <section className="min-w-0">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className={SECTION}>Documents</h2>
              {!docsError && !upload && (
                <button type="button" onClick={() => setUpload(blankUpload())} className="text-[13px] font-medium text-primary hover:underline">
                  Upload document
                </button>
              )}
            </div>

            {upload && (
              <div className="mb-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="col-span-2 block">
                    <span className={LABEL}>Document</span>
                    <select value={upload.docType} onChange={(e) => setUpload({ ...upload, docType: e.target.value as SubDocumentType })} className={FIELD}>
                      {SUB_DOCUMENT_TYPES.map((t) => (
                        <option key={t} value={t}>{SUB_DOCUMENT_TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2 block">
                    <span className={LABEL}>File (PDF or photo)</span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,image/*,application/pdf"
                      onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] ?? null })}
                      className="block w-full text-[12px] text-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-[12px]"
                    />
                  </label>
                  <label className="block">
                    <span className={LABEL}>{upload.docType === "agreement" ? "Signed on" : upload.docType === "w9" ? "Dated" : "Effective"}</span>
                    <input type="date" value={upload.issuedDate} onChange={(e) => setUpload({ ...upload, issuedDate: e.target.value })} className={FIELD} />
                  </label>
                  {upload.docType !== "w9" && upload.docType !== "agreement" && (
                    <label className="block">
                      <span className={LABEL}>Expires</span>
                      <input type="date" value={upload.expirationDate} onChange={(e) => setUpload({ ...upload, expirationDate: e.target.value })} className={FIELD} />
                    </label>
                  )}
                  {INSURANCE_DOCUMENT_TYPES.has(upload.docType) && (
                    <>
                      <label className="block">
                        <span className={LABEL}>Carrier</span>
                        <input value={upload.carrier} onChange={(e) => setUpload({ ...upload, carrier: e.target.value })} className={FIELD} />
                      </label>
                      <label className="block">
                        <span className={LABEL}>Policy #</span>
                        <input value={upload.policyNumber} onChange={(e) => setUpload({ ...upload, policyNumber: e.target.value })} className={FIELD} />
                      </label>
                      <label className="block">
                        <span className={LABEL}>Coverage $</span>
                        <input type="number" min="0" inputMode="decimal" placeholder="1000000" value={upload.coverageAmount} onChange={(e) => setUpload({ ...upload, coverageAmount: e.target.value })} className={FIELD} />
                      </label>
                      <label className="col-span-2 flex items-center gap-2 self-end pb-1.5 text-[13px] text-foreground sm:col-span-3">
                        <input type="checkbox" checked={upload.additionalInsured} onChange={(e) => setUpload({ ...upload, additionalInsured: e.target.checked })} />
                        We&apos;re listed as additional insured
                      </label>
                    </>
                  )}
                </div>
                <div className="mt-2 flex justify-end gap-2 text-[13px]">
                  <button type="button" onClick={() => setUpload(null)} className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!upload.file || uploading}
                    onClick={submitUpload}
                    className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {uploading ? "Uploading…" : "Upload"}
                  </button>
                </div>
              </div>
            )}

            {!docsError && (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {sortedDocs.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                    No documents yet. Start with the W-9, insurance certificates and the signed agreement.
                  </p>
                ) : (
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-primary/10 text-[11px] uppercase tracking-wide text-primary [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold">
                      <tr>
                        <th>Document</th>
                        <th className="hidden sm:table-cell">Details</th>
                        <th>Expires</th>
                        <th className="w-px" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sortedDocs.map((d) => {
                        const old = !current.has(d.id);
                        const expired = !!d.expirationDate && d.expirationDate < new Date().toISOString().slice(0, 10);
                        const insurance = INSURANCE_DOCUMENT_TYPES.has(d.docType);
                        if (editDocId === d.id) {
                          return (
                            <tr key={d.id} className="bg-muted/30">
                              <td colSpan={4} className="px-3 py-2">
                                <div className="mb-1 text-[12px] font-semibold text-foreground">{SUB_DOCUMENT_TYPE_LABEL[d.docType]}</div>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                  <label className="block">
                                    <span className={LABEL}>Effective</span>
                                    <input type="date" value={docDraft.issuedDate} onChange={(e) => setDocDraft({ ...docDraft, issuedDate: e.target.value })} className={FIELD} />
                                  </label>
                                  <label className="block">
                                    <span className={LABEL}>Expires</span>
                                    <input type="date" value={docDraft.expirationDate} onChange={(e) => setDocDraft({ ...docDraft, expirationDate: e.target.value })} className={FIELD} />
                                  </label>
                                  {insurance && (
                                    <>
                                      <label className="block">
                                        <span className={LABEL}>Carrier</span>
                                        <input value={docDraft.carrier} onChange={(e) => setDocDraft({ ...docDraft, carrier: e.target.value })} className={FIELD} />
                                      </label>
                                      <label className="block">
                                        <span className={LABEL}>Policy #</span>
                                        <input value={docDraft.policyNumber} onChange={(e) => setDocDraft({ ...docDraft, policyNumber: e.target.value })} className={FIELD} />
                                      </label>
                                      <label className="block">
                                        <span className={LABEL}>Coverage $</span>
                                        <input type="number" value={docDraft.coverageAmount} onChange={(e) => setDocDraft({ ...docDraft, coverageAmount: e.target.value })} className={FIELD} />
                                      </label>
                                    </>
                                  )}
                                </div>
                                <div className="mt-2 flex justify-end gap-2 text-[12px]">
                                  <button type="button" onClick={() => setEditDocId(null)} className="px-2 py-1 text-muted-foreground hover:text-foreground">Cancel</button>
                                  <button type="button" onClick={() => saveDoc(d)} className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground hover:bg-primary/90">Save</button>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={d.id} className={`align-top ${old ? "text-muted-foreground" : ""}`}>
                            <td className="px-3 py-2">
                              <a
                                href={`/api/company-documents/download?path=${encodeURIComponent(d.storagePath)}`}
                                target="_blank"
                                rel="noreferrer"
                                className={`font-semibold hover:underline ${old ? "text-muted-foreground" : "text-foreground hover:text-primary"}`}
                              >
                                {SUB_DOCUMENT_TYPE_LABEL[d.docType]}
                              </a>
                              {old && <span className="ml-1.5 text-[11px]">older copy</span>}
                              <div className="max-w-[16rem] truncate text-[11px] text-muted-foreground">
                                {d.name} · added {shortDate(d.createdAt)}
                              </div>
                            </td>
                            <td className="hidden px-3 py-2 text-[12px] text-muted-foreground sm:table-cell">
                              {insurance
                                ? [d.carrier, d.policyNumber && `#${d.policyNumber}`, d.coverageAmount && money(d.coverageAmount).replace(/\.00$/, ""), d.additionalInsured ? "Additional insured" : d.additionalInsured === false ? "Not additional insured" : null]
                                    .filter(Boolean)
                                    .join(" · ") || "—"
                                : d.issuedDate
                                  ? `${d.docType === "agreement" ? "Signed" : "Dated"} ${shortDate(d.issuedDate)}`
                                  : "—"}
                            </td>
                            <td className={`whitespace-nowrap px-3 py-2 tabular-nums ${expired && !old ? "font-semibold text-danger" : ""}`}>
                              {d.expirationDate ? shortDate(d.expirationDate) : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right text-[12px]">
                              {removeDocId === d.id ? (
                                <>
                                  <button type="button" onClick={() => removeDoc(d)} className="rounded-md bg-danger px-2 py-0.5 font-medium text-danger-foreground">Remove</button>
                                  <button type="button" onClick={() => setRemoveDocId(null)} className="ml-1 px-1 text-muted-foreground hover:text-foreground">Keep</button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditDocId(d.id);
                                      setDocDraft({
                                        issuedDate: d.issuedDate ?? "",
                                        expirationDate: d.expirationDate ?? "",
                                        carrier: d.carrier ?? "",
                                        policyNumber: d.policyNumber ?? "",
                                        coverageAmount: d.coverageAmount != null ? String(d.coverageAmount) : "",
                                      });
                                    }}
                                    className="text-primary hover:underline"
                                  >
                                    Edit
                                  </button>
                                  <button type="button" onClick={() => setRemoveDocId(d.id)} className="ml-2 text-muted-foreground hover:text-danger">
                                    Remove
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ---------------- Jobs ---------------- */}
            <div className="mb-1.5 mt-5 flex items-center justify-between">
              <h2 className={SECTION}>Jobs</h2>
              {row && (
                <span className="text-[12px] text-muted-foreground">
                  Paid {money(row.paid)}
                  {row.owed > 0 && <> · <span className="font-semibold text-warning">owed {money(row.owed)}</span></>}
                </span>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {!row || row.lines.length === 0 ? (
                <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Not assigned to any estimate yet. Assign subs from the estimate&apos;s Subs tab.</p>
              ) : (
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-primary/10 text-[11px] uppercase tracking-wide text-primary [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold">
                    <tr>
                      <th>Job</th>
                      <th className="text-right">Assigned</th>
                      <th className="hidden text-right sm:table-cell">Paid</th>
                      <th className="text-right">Owed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border tabular-nums">
                    {jobLines.map((l) => {
                      const href = jobHref(l.estimateId, l.projectId);
                      return (
                        <tr key={l.assignmentId}>
                          <td className="px-3 py-2">
                            {href ? <Link href={href} className="text-foreground hover:text-primary hover:underline">{l.label}</Link> : l.label}
                          </td>
                          <td className="px-3 py-2 text-right">{money(l.contracted)}</td>
                          <td className="hidden px-3 py-2 text-right text-muted-foreground sm:table-cell">{money(l.paid)}</td>
                          <td className={`px-3 py-2 text-right ${l.outstanding > 0.005 ? "font-semibold text-warning" : "text-muted-foreground"}`}>
                            {l.outstanding > 0.005 ? money(l.outstanding) : "Paid"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {hiddenJobs > 0 && (
                <button type="button" onClick={() => setAllJobs(true)} className="w-full border-t border-border px-3 py-1.5 text-left text-[12px] text-primary hover:bg-muted/40">
                  Show all {row?.lines.length} jobs
                </button>
              )}
            </div>
            {owedLines.length > 0 && (
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                {owedLines.length} {owedLines.length === 1 ? "job" : "jobs"} unpaid.{" "}
                <Link href={`/payroll?person=sub:${sub.id}`} className="text-primary hover:underline">Pay in Payroll →</Link>
              </p>
            )}
          </section>

          {/* ---------------- Profile ---------------- */}
          <section className="min-w-0">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className={SECTION}>Profile</h2>
              {!editing && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(toDraft(sub));
                    setEditing(true);
                    setNotice(null);
                  }}
                  className="text-[13px] font-medium text-primary hover:underline"
                >
                  Edit
                </button>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              {editing && draft ? (
                <div className="space-y-3">
                  <fieldset className="grid grid-cols-2 gap-2">
                    <legend className="mb-1 text-[12px] font-semibold text-foreground">Business</legend>
                    <div className="col-span-2">{field("name", "Name on roster *")}</div>
                    <div className="col-span-2">{field("companyName", "Legal business name")}</div>
                    {field("trade", "Trade")}
                    <label className="block">
                      <span className={LABEL}>Entity type</span>
                      <select value={draft.entityType} onChange={(e) => setDraft({ ...draft, entityType: e.target.value })} className={FIELD}>
                        <option value="">Not set</option>
                        {SUB_ENTITY_TYPES.map((t) => (
                          <option key={t} value={t}>{SUB_ENTITY_TYPE_LABEL[t]}</option>
                        ))}
                      </select>
                    </label>
                    {field("taxIdLast4", "EIN/SSN last 4", { inputMode: "numeric", maxLength: 4, placeholder: "1234" })}
                  </fieldset>
                  <fieldset className="grid grid-cols-2 gap-2">
                    <legend className="mb-1 text-[12px] font-semibold text-foreground">Contact</legend>
                    {field("contactPerson", "Contact person")}
                    {field("phone", "Phone", { inputMode: "tel" })}
                    <div className="col-span-2">{field("email", "Email", { type: "email" })}</div>
                    <div className="col-span-2">{field("address", "Mailing address")}</div>
                  </fieldset>
                  <fieldset className="grid grid-cols-[1fr_5rem] gap-2">
                    <legend className="mb-1 text-[12px] font-semibold text-foreground">License</legend>
                    {field("licenseNumber", "License #")}
                    {field("licenseState", "State", { maxLength: 2, placeholder: "CA" })}
                  </fieldset>
                  <fieldset className="grid grid-cols-2 gap-2">
                    <legend className="mb-1 text-[12px] font-semibold text-foreground">Payment</legend>
                    {field("paymentMethod", "Preferred method", { placeholder: "Check, ACH, Zelle" })}
                    {field("payToName", "Make checks out to")}
                  </fieldset>
                  <label className="block">
                    <span className={LABEL}>Notes</span>
                    <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} className={`${FIELD} h-auto py-1.5`} />
                  </label>
                  <p className="text-[11px] text-muted-foreground">Only the last 4 digits are saved. The full number stays on the W-9 file.</p>
                  <div className="flex justify-end gap-2 text-[13px]">
                    <button type="button" onClick={() => setEditing(false)} className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground">Cancel</button>
                    <button type="button" disabled={saving} onClick={saveProfile} className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <dl className="divide-y divide-border/60">
                  {dd("Legal name", sub.companyName)}
                  {dd("Trade", sub.trade)}
                  {dd("Entity type", sub.entityType ? SUB_ENTITY_TYPE_LABEL[sub.entityType] : null)}
                  {dd("EIN/SSN", sub.taxIdLast4 ? `•••• ${sub.taxIdLast4}` : null)}
                  {dd("Contact", sub.contactPerson)}
                  {dd("Phone", sub.phone ? <a href={`tel:${sub.phone}`} className="hover:underline">{sub.phone}</a> : null)}
                  {dd("Email", sub.email ? <a href={`mailto:${sub.email}`} className="hover:underline">{sub.email}</a> : null)}
                  {dd("Address", sub.address)}
                  {dd("License", sub.licenseNumber ? [sub.licenseNumber, sub.licenseState].filter(Boolean).join(" · ") : null)}
                  {dd("Pays by", [sub.paymentMethod, sub.payToName && `to ${sub.payToName}`].filter(Boolean).join(" ") || null)}
                  {dd("Notes", sub.notes)}
                </dl>
              )}
            </div>

            {row && row.payments.length > 0 && (
              <>
                <div className="mb-1.5 mt-5 flex items-center justify-between">
                  <h2 className={SECTION}>Recent payments</h2>
                  <Link href="/payroll/history" className="text-[12px] text-primary hover:underline">History →</Link>
                </div>
                <ul className="divide-y divide-border rounded-xl border border-border bg-card text-[13px]">
                  {row.payments.slice(0, 5).map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-2 px-4 py-2">
                      <span className="min-w-0 truncate">
                        <span className="tabular-nums text-muted-foreground">{shortDate(p.paymentDate)}</span> · {p.label}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
    </PageContainer>
  );
}

export default function SubcontractorPage() {
  return (
    <RequirePermission resource="subcontractor_assignment" action="view">
      <SubcontractorDetail />
    </RequirePermission>
  );
}
