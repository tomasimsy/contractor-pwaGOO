"use client";

/**
 * Estimate Create/Edit form — replaces an earlier draft of this same
 * file that was built against lib/services-context.tsx's standalone
 * <ServicesProvider>/useServices() (a separate, PROP-driven context,
 * never wired into app/layout.tsx or any real route — confirmed via a
 * repo-wide grep: nothing under app/(app) imports it). That version
 * was unreachable dead code, not "the existing system" to extend; the
 * real, live provider every other page (Clients, Projects) actually
 * uses is components/providers/ServicesProvider.tsx, which is what
 * this version reads from. Building on the orphaned one would have
 * been the parallel estimate system this module is explicitly not
 * supposed to create.
 *
 * This component's job is display + input collection ONLY — every
 * total shown comes back from financialCalculations.ts (the same
 * functions EstimateService itself delegates to), never computed
 * ad hoc here.
 */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { LineItemEditor, type DraftLineItem } from "./LineItemEditor";
import { RoofingAreasEditor } from "./RoofingAreasEditor";
import { RoofingAreasEditorV2 } from "./RoofingAreasEditorV2";
import { EstimatePhotosEditor } from "./EstimatePhotosEditor";
import { Modal } from "@/components/ui/Modal";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { ClientForm } from "@/components/clients/ClientForm";
import { calculateSubtotal, calculateLineItemTotal, calculateDocumentTotal } from "@/lib/services/financialCalculations";
import { createEstimateForClient } from "@/lib/services/estimateCreationWorkflow";
import type { Estimate, EstimateLineItem } from "@/lib/services/estimateService";
import type { EstimatePhoto } from "@/lib/services/estimatePhotoService";
import type { RoofingArea } from "@/lib/services";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function EstimateForm({
  estimate,
  lineItems: initialLineItems,
  roofV2 = false,
  basePath = "/estimates",
}: {
  estimate?: Estimate;
  lineItems?: EstimateLineItem[];
  /**
   * Estimate Roof V2 only. When true: estimate type is locked to
   * "roofing" (no Standard/Roofing radio shown) and the per-area editor
   * is RoofingAreasEditorV2 (measurements/inspection/notes/line items)
   * instead of the V1 RoofingAreasEditor. Defaults to false so every
   * existing route using EstimateForm (/estimates/**) is byte-for-byte
   * unchanged.
   */
  roofV2?: boolean;
  /**
   * Base route this form redirects to after create/update. Defaults to
   * "/estimates" (existing behavior, unchanged for every current
   * caller). Estimate Roof V2 pages pass "/estimates-roof" so a newly
   * created roofing estimate lands on the V2 edit route instead of V1's.
   */
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { estimateService, projectService, clientService, roofingAreaService, estimatePhotoService } = useServices();
  const { profile } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(estimate?.projectId ?? searchParams.get("projectId") ?? "");
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  // Only consulted when the selected project has no client of its own
  // (see selectedProject.clientId branch below) — a project WITH a
  // client keeps the existing auto-loaded, read-only behavior
  // unchanged; this is purely the fallback picker for a client-less
  // project, saved as the ESTIMATE's own clientId (estimates already
  // carry clientId independently of their project — see handleSubmit).
  const [manualClientId, setManualClientId] = useState(estimate?.clientId ?? "");
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [title, setTitle] = useState(estimate?.title ?? "");
  const [description, setDescription] = useState(estimate?.description ?? "");
  const [estimateType, setEstimateType] = useState<"standard" | "roofing">(estimate?.estimateType ?? (roofV2 ? "roofing" : "standard"));
  const [lineItems, setLineItems] = useState<DraftLineItem[]>(
    initialLineItems?.map((li) => ({ category: li.category, name: li.name, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, unit: li.unit ?? null, taxable: li.taxable })) ?? []
  );
  const [roofingAreas, setRoofingAreas] = useState<RoofingArea[]>([]);
  const [estimatePhotos, setEstimatePhotos] = useState<{ before: EstimatePhoto[]; after: EstimatePhoto[] }>({ before: [], after: [] });
  const [markup, setMarkup] = useState(estimate?.markup ?? 0);
  const [discount, setDiscount] = useState(estimate?.discount ?? 0);
  const [taxRate, setTaxRate] = useState(estimate?.taxRate ?? 0);
  const [depositAmount, setDepositAmount] = useState(estimate?.depositAmount ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Roofing estimates' subtotal/total are derived from every roof
  // area's line items (see EstimateService.recalculateTotal /
  // writeRecalculatedTotals' estimate_type branch) rather than the
  // `lineItems` state above, which stays empty/unused for roofing
  // estimates. Populated on load and refreshed after every area/line-
  // item mutation via refreshRoofingTotals() below — never computed
  // independently here.
  const [roofingTotals, setRoofingTotals] = useState<{ subtotal: number; total: number } | null>(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    projectService.list({ companyId: profile.companyId }).then(setProjects);
  }, [projectService, profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    clientService.list({ companyId: profile.companyId }).then(setClients);
  }, [clientService, profile?.companyId]);

  useEffect(() => {
    if (!estimate || estimateType !== "roofing") return;
    roofingAreaService.listForEstimate(estimate.id).then(setRoofingAreas);
  }, [estimate, estimateType, roofingAreaService]);

  useEffect(() => {
    if (!estimate || estimateType !== "roofing") return;
    setRoofingTotals({ subtotal: estimate.subtotal, total: estimate.total });
  }, [estimate, estimateType]);

  async function refreshRoofingTotals() {
    if (!estimate) return;
    try {
      const updated = await estimateService.recalculateTotal(estimate.id);
      setRoofingTotals({ subtotal: updated.subtotal, total: updated.total });
    } catch (err) {
      console.error("Failed to recalculate roofing estimate totals:", err);
    }
  }

  useEffect(() => {
    if (!estimate) return;
    estimatePhotoService.getForEstimate(estimate.id).then(setEstimatePhotos);
  }, [estimate, estimatePhotoService]);

  const selectedProject = projects.find((p) => p.id === projectId);
  // Roofing estimates: SUBTOTAL comes from the backend (roofingTotals,
  // refreshed after every area/line-item mutation via
  // refreshRoofingTotals) since it's derived from roofing area line
  // items, not the `lineItems` state. Standard estimates: computed
  // locally via the same calculateSubtotal EstimateService itself uses.
  //
  // TOTAL must NEVER be taken from roofingTotals.total — that figure
  // was computed server-side from whatever markup/discount/taxRate
  // were STORED at the time of the last area save, not the values
  // currently typed into the form below. Previously this used
  // roofingTotals.total directly for roofing estimates, so editing Tax
  // Rate/Markup/Discount had no visible effect on the Total preview
  // until after a save — found live: "when i remove the tax rate, the
  // total doesn't update." Always recomputing from the live form state
  // via the same calculateDocumentTotal formula EstimateService uses
  // fixes this for both estimate types with one formula, not two.
  const subtotal = roofV2 && roofingTotals ? roofingTotals.subtotal : calculateSubtotal(lineItems.map((li) => ({ total: calculateLineItemTotal(li) })));
  const total = calculateDocumentTotal(subtotal, markup, discount, taxRate).total;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A project is no longer required up front: with a client chosen
    // and no project, createEstimateForClient resolves (or creates)
    // one. One of the two must be present.
    if (!profile?.companyId || (!projectId && !manualClientId)) return;
    if (!title.trim()) {
      setError("An estimate needs a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (estimate) {
        await estimateService.update(estimate.id, {
          title: title.trim(),
          description: description || null,
          projectId,
          clientId: selectedProject?.clientId ?? (manualClientId || null),
          markup,
          discount,
          taxRate,
          depositAmount,
          estimateType,
        });
        await estimateService.updateLineItems(estimate.id, lineItems);
        router.push(`${basePath}/${estimate.id}`);
      } else {
        const clientId = selectedProject?.clientId ?? (manualClientId || null);
        const { redirectTo, projectCreated, project } = await createEstimateForClient(
          { projectService, estimateService },
          {
            companyId: profile.companyId,
            // Empty string means "none selected" in this <select>.
            projectId: projectId || null,
            clientId,
            clientName: clients.find((c) => c.id === clientId)?.name ?? null,
            title: title.trim(),
            description: description || undefined,
            lineItems,
            markup,
            discount,
            taxRate,
            depositAmount,
            estimateType,
          },
          basePath
        );
        // Keep the picker honest for anyone who navigates back: an
        // auto-created project is a real project and belongs in the list.
        if (projectCreated && project) setProjects((prev) => [...prev, project]);
        router.push(redirectTo);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save estimate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
      {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="">Auto — use the client’s project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowNewProjectModal(true)}
            className="text-xs font-medium text-primary hover:underline"
          >
            + Add New Project
          </button>
          <p className="text-xs text-muted-foreground">Leave on Auto and the client’s project is used, or created for them.</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Client</label>
          {selectedProject?.clientId ? (
            <div className="flex h-[34px] items-center rounded-lg border border-input bg-muted px-3 text-sm text-foreground">
              {clients.find((c) => c.id === selectedProject.clientId)?.name ?? "Auto-loaded from project"}
            </div>
          ) : (
            <>
              <select
                value={manualClientId}
                onChange={(e) => setManualClientId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <option value="">No client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewClientModal(true)}
                className="text-xs font-medium text-primary hover:underline"
              >
                + Add New Client
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Title *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Short title for this estimate"
          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Project overview shown on the estimate and its PDF"
          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      {!roofV2 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">Estimate Type</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="estimateType"
                value="standard"
                checked={estimateType === "standard"}
                onChange={(e) => setEstimateType(e.target.value as "standard" | "roofing")}
                className="w-4 h-4"
              />
              <span className="text-sm text-foreground">Standard (Line Items)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="estimateType"
                value="roofing"
                checked={estimateType === "roofing"}
                onChange={(e) => setEstimateType(e.target.value as "standard" | "roofing")}
                className="w-4 h-4"
              />
              <span className="text-sm text-foreground">Roofing (Areas)</span>
            </label>
          </div>
        </div>
      )}

      {estimate && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">Photos</label>
          <EstimatePhotosEditor
            estimateId={estimate.id}
            photos={estimatePhotos}
            onChange={setEstimatePhotos}
            onDelete={async (photoId) => {
              try {
                await estimatePhotoService.softDelete(photoId);
                setEstimatePhotos((prev) => ({
                  before: prev.before.filter((p) => p.id !== photoId),
                  after: prev.after.filter((p) => p.id !== photoId),
                }));
              } catch (err) {
                console.error("Error deleting photo:", err);
                throw err;
              }
            }}
            onPhotoUpload={(photo) => {
              setEstimatePhotos((prev) => {
                const type = photo.photoType;
                return {
                  ...prev,
                  [type]: [...prev[type], photo],
                };
              });
            }}
          />
        </div>
      )}

      {estimateType === "roofing" && (
        <>
          {estimate && profile?.companyId ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Roof Areas</label>
              {roofV2 ? (
                <RoofingAreasEditorV2
                  estimateId={estimate.id}
                  areas={roofingAreas}
                  onChange={setRoofingAreas}
                  onSave={async (area) => {
                    try {
                      const areaWithCompany = { ...area, companyId: profile.companyId };
                      let saved: RoofingArea;
                      // Whether this area already exists in the DB must be
                      // judged by area.companyId (empty string for a
                      // freshly-added, never-persisted area — see
                      // handleAddArea), NOT by `roofingAreas.find(...)`:
                      // a brand-new area is already present in local
                      // `roofingAreas` state the instant "Add Area" is
                      // clicked (onChange runs immediately), so that find()
                      // always matched and routed every first save to
                      // update() — which then 0-rowed (PGRST116) because
                      // the row never existed yet.
                      if (area.id && area.companyId) {
                        saved = await roofingAreaService.update(area.id, areaWithCompany);
                      } else {
                        saved = await roofingAreaService.create(areaWithCompany);
                      }
                      // Match on the ORIGINAL client-side draft id
                      // (area.id), not saved.id: create() mints a brand
                      // new server-side UUID, different from the local
                      // draft's id — matching on saved.id here meant this
                      // replacement never found the draft to replace, so
                      // the stale draft (with empty companyId) stayed in
                      // state forever, permanently disabling photo/line-
                      // item buttons for that area even though the DB
                      // row saved correctly.
                      setRoofingAreas((prev) => prev.map((a) => (a.id === area.id ? saved : a)));
                      // Totals refresh happens once, AFTER this area's
                      // line items also save (see RoofingAreasEditorV2's
                      // handleSaveArea → onAreaLineItemsSaved), not here
                      // — recalculating before the line-item write lands
                      // would show a stale subtotal for one extra beat.
                      return saved;
                    } catch (err) {
                      console.error("Error saving roofing area:", err instanceof Error ? err.message : JSON.stringify(err));
                      throw err;
                    }
                  }}
                  onDelete={async (areaId) => {
                    try {
                      await roofingAreaService.softDelete(areaId, "Deleted by user");
                      await refreshRoofingTotals();
                    } catch (err) {
                      console.error("Error deleting roofing area:", err);
                      throw err;
                    }
                  }}
                  onAreaLineItemsSaved={refreshRoofingTotals}
                />
              ) : (
                <RoofingAreasEditor
                  estimateId={estimate.id}
                  areas={roofingAreas}
                  onChange={setRoofingAreas}
                  onSave={async (area) => {
                    try {
                      console.log("EstimateForm onSave called with area:", area);
                      const areaWithCompany = {
                        ...area,
                        companyId: profile.companyId,
                      };
                      console.log("Prepared area with company:", areaWithCompany);
                      // See the V2 branch's comment above: existence must
                      // be judged by area.companyId, not roofingAreas.find(),
                      // which always matches a just-added local-only area.
                      let saved: RoofingArea;
                      if (area.id && area.companyId) {
                        console.log("Updating existing area");
                        saved = await roofingAreaService.update(area.id, areaWithCompany);
                      } else {
                        console.log("Creating new area");
                        saved = await roofingAreaService.create(areaWithCompany);
                      }
                      console.log("Area saved successfully");
                      setRoofingAreas((prev) =>
                        prev.map((a) => a.id === area.id ? saved : a)
                      );
                    } catch (err) {
                      console.error("Error saving roofing area:", err instanceof Error ? err.message : JSON.stringify(err));
                      throw err;
                    }
                  }}
                  onDelete={async (areaId) => {
                    try {
                      await roofingAreaService.softDelete(areaId, "Deleted by user");
                    } catch (err) {
                      console.error("Error deleting roofing area:", err);
                      throw err;
                    }
                  }}
                />
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-sm text-blue-800">
                <strong>Roof Areas:</strong> Create the estimate first, then you'll be able to add roof areas and photos on the edit page.
              </p>
            </div>
          )}
        </>
      )}

      {!roofV2 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">Line items</label>
          <LineItemEditor items={lineItems} onChange={setLineItems} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Markup ($)</label>
          <input type="number" step="any" value={markup} onChange={(e) => setMarkup(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Discount ($)</label>
          <input type="number" step="any" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Tax rate (%)</label>
          <input type="number" step="any" value={taxRate} onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Deposit ($)</label>
          <input type="number" step="any" value={depositAmount} onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 px-4 py-3 text-right text-sm">
        <span className="text-muted-foreground">Total: </span>
        <span className="font-semibold text-foreground">{formatMoney(total)}</span>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
          Cancel
        </button>
        <button type="submit" disabled={saving || !title.trim() || (!projectId && !manualClientId)} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Saving…" : estimate ? "Save changes" : "Create estimate"}
        </button>
      </div>
    </form>

    <Modal open={showNewProjectModal} onClose={() => setShowNewProjectModal(false)} title="New Project">
      <ProjectForm
        onCreated={(created) => {
          setProjects((prev) => [...prev, created]);
          setProjectId(created.id);
          setShowNewProjectModal(false);
        }}
        onCancel={() => setShowNewProjectModal(false)}
      />
    </Modal>

    <Modal open={showNewClientModal} onClose={() => setShowNewClientModal(false)} title="New Client">
      <ClientForm
        client={null}
        companyId={profile?.companyId ?? ""}
        onClose={() => setShowNewClientModal(false)}
        onSaved={(created) => {
          setClients((prev) => [...prev, created]);
          setManualClientId(created.id);
          setShowNewClientModal(false);
        }}
      />
    </Modal>
    </>
  );
}
