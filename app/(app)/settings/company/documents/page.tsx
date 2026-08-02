"use client";

/**
 * Company Documents — categorized business file storage
 * (company_documents metadata + `company-documents` Supabase Storage
 * bucket, both introduced alongside Company Settings). Same
 * upload/download route pair the logo uses
 * (app/api/company-documents/upload|download), same soft-delete/
 * restore + required-reason discipline every other financial record
 * in this app already follows (see EstimateService.softDelete's doc
 * comment) — reused here for consistency even though a document isn't
 * a financial record itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Eye, FolderLock, Pencil, Search, Trash2, Upload } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { usePermission } from "@/lib/hooks/usePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  COMPANY_DOCUMENT_CATEGORIES,
  COMPANY_DOCUMENT_CATEGORY_LABEL,
  type CompanyDocument,
  type CompanyDocumentCategory,
} from "@/lib/services/companyDocumentService";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadUrl(storagePath: string, fileType: string): string {
  return `/api/company-documents/download?path=${encodeURIComponent(storagePath)}&contentType=${encodeURIComponent(fileType)}`;
}

function CompanyDocumentsContent() {
  const { companyDocumentService } = useServices();
  const { profile } = useAuth();
  const canUpload = usePermission("company_settings", "create");
  const canDelete = usePermission("company_settings", "delete");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CompanyDocumentCategory | "all">("all");

  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<CompanyDocumentCategory>("other");
  const [uploadExpiration, setUploadExpiration] = useState("");

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingDoc, setDeletingDoc] = useState<CompanyDocument | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [previewDoc, setPreviewDoc] = useState<CompanyDocument | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const companyId = profile?.companyId ?? null;

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      setDocuments(await companyDocumentService.listForCompany(companyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, [companyDocumentService, companyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = documents;
    if (categoryFilter !== "all") rows = rows.filter((d) => d.category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((d) => d.name.toLowerCase().includes(q));
    }
    return rows;
  }, [documents, categoryFilter, search]);

  async function handleUpload(file: File) {
    if (!companyId) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", "document");
      body.append("category", uploadCategory);
      body.append("name", file.name);
      if (uploadExpiration) body.append("expirationDate", uploadExpiration);
      const res = await fetch("/api/company-documents/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to upload document.");
      setUploadExpiration("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRename(doc: CompanyDocument) {
    if (!renameValue.trim()) return;
    setBusyId(doc.id);
    setError(null);
    try {
      await companyDocumentService.rename(doc.id, renameValue.trim());
      setRenamingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename document.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deletingDoc || !deleteReason.trim()) return;
    setBusyId(deletingDoc.id);
    setError(null);
    try {
      await companyDocumentService.softDelete(deletingDoc.id, deleteReason.trim());
      setDeletingDoc(null);
      setDeleteReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Company Documents"
        description="LLC/EIN paperwork, licenses, insurance, tax documents, and other business files."
        actions={
          <Link href="/settings/company" className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
            <ArrowLeft className="size-3.5" /> Company Settings
          </Link>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {canUpload && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Category</label>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value as CompanyDocumentCategory)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
            >
              {COMPANY_DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{COMPANY_DOCUMENT_CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Expiration (optional)</label>
            <input
              type="date"
              value={uploadExpiration}
              onChange={(e) => setUploadExpiration(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
            />
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Upload className="size-3.5" /> {uploading ? "Uploading…" : "Upload document"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search document name…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as CompanyDocumentCategory | "all")}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
        >
          <option value="all">All categories</option>
          {COMPANY_DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{COMPANY_DOCUMENT_CATEGORY_LABEL[c]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderLock}
          title={documents.length === 0 ? "No documents yet" : "Nothing matches that filter"}
          description={documents.length === 0 ? "Upload your LLC paperwork, licenses, insurance, and other business documents here." : "Try a different search or category."}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</th>
                <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Uploaded</th>
                <th className="hidden px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Expires</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((doc) => {
                const isExpired = doc.expirationDate && doc.expirationDate < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={doc.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2.5">
                      {renamingId === doc.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleRename(doc)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
                          />
                          <button type="button" onClick={() => handleRename(doc)} disabled={busyId === doc.id} className="text-xs font-medium text-primary hover:underline">Save</button>
                          <button type="button" onClick={() => setRenamingId(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                        </div>
                      ) : (
                        <span className="font-medium text-foreground">{doc.name}</span>
                      )}
                      <div className="text-xs text-muted-foreground">{formatBytes(doc.fileSize)}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone="neutral">{COMPANY_DOCUMENT_CATEGORY_LABEL[doc.category]}</Badge>
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                      {doc.createdAt.slice(0, 10)}{doc.uploadedBy === profile?.userId ? " · You" : ""}
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs md:table-cell">
                      {doc.expirationDate ? (
                        <span className={isExpired ? "font-medium text-danger" : "text-muted-foreground"}>
                          {doc.expirationDate}{isExpired ? " (expired)" : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => setPreviewDoc(doc)} aria-label="Preview" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Eye className="size-3.5" />
                        </button>
                        <a href={downloadUrl(doc.storagePath, doc.fileType)} download={doc.name} aria-label="Download" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Download className="size-3.5" />
                        </a>
                        {canUpload && (
                          <button
                            type="button"
                            onClick={() => { setRenamingId(doc.id); setRenameValue(doc.name); }}
                            aria-label="Rename"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeletingDoc(doc)}
                            aria-label="Delete"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={previewDoc != null} onClose={() => setPreviewDoc(null)} title={previewDoc?.name}>
        {previewDoc && (
          previewDoc.fileType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={downloadUrl(previewDoc.storagePath, previewDoc.fileType)} alt={previewDoc.name} className="max-h-[70vh] w-full rounded-lg object-contain" />
          ) : previewDoc.fileType === "application/pdf" ? (
            <iframe src={downloadUrl(previewDoc.storagePath, previewDoc.fileType)} title={previewDoc.name} className="h-[70vh] w-full rounded-lg border border-border" />
          ) : (
            <p className="text-sm text-muted-foreground">
              No inline preview for this file type — use Download instead.
            </p>
          )
        )}
      </Modal>

      <Modal open={deletingDoc != null} onClose={() => { setDeletingDoc(null); setDeleteReason(""); }} title="Delete this document?">
        {deletingDoc && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Delete <span className="font-medium">{deletingDoc.name}</span>? This can be restored later if needed — nothing is permanently removed.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Reason (required)</label>
              <input
                autoFocus
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Uploaded in error, superseded by a newer file…"
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setDeletingDoc(null); setDeleteReason(""); }} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
                Cancel
              </button>
              <button
                type="button"
                disabled={!deleteReason.trim() || busyId === deletingDoc.id}
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

export default function CompanyDocumentsPage() {
  return (
    <RequirePermission resource="company_settings" action="view">
      <CompanyDocumentsContent />
    </RequirePermission>
  );
}
