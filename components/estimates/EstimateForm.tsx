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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, FileText, Home, ListChecks, Calculator, Camera } from "lucide-react";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { LineItemEditor, type DraftLineItem } from "./LineItemEditor";
import { RoofingAreasEditorV2, type RoofingAreasEditorV2Ref } from "./RoofingAreasEditorV2";
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

/* ------------------------------------------------------------------
 * PRESENTATION ONLY
 * ------------------------------------------------------------------
 * Everything below this comment is layout, spacing and colour. No
 * field was added, removed, renamed or re-wired; every input keeps the
 * exact value/onChange/required/disabled it had, and every conditional
 * (roofV2, estimateType, typeLocked, `estimate` present) is unchanged.
 *
 * The form was one flat 3xl column of ~14 equally-weighted blocks, so
 * nothing signalled where one concern ended and the next began — and
 * the per-area photo upload ended up buried a thousand pixels inside
 * an unlabelled card (reported live: "I'm not seeing where I can
 * upload photos for each area"). These sections exist to make the
 * shape of the form legible at a glance.
 * ------------------------------------------------------------------ */

/** One shared input style. Previously this exact class string was
 * repeated on all ten inputs, which is how they drifted apart. */
/* ------------------------------------------------------------------
 * COLOUR RULE FOR THIS FILE: token classes only. NO `dark:` variants.
 * ------------------------------------------------------------------
 * This app switches themes with `data-theme` on <html> (app/layout.tsx),
 * chosen deliberately so a user's explicit setting can override their
 * OS. But Tailwind v4's `dark:` variant defaults to
 * `@media (prefers-color-scheme: dark)`, and globals.css declares no
 * `@custom-variant dark` — so `dark:` fires off the OS setting and is
 * completely disconnected from the theme the app is actually rendering.
 *
 * With the app on LIGHT and the OS on DARK, an earlier version of this
 * form applied dark-mode colours over a white page: measured at
 * near-white text (lab 97.8) on a #ffffff background. Unreadable.
 *
 * `bg-card`, `text-foreground`, `border-input`, `bg-muted`,
 * `text-muted-foreground`, `text-primary` all resolve through the CSS
 * variables that data-theme actually swaps, so they are correct in both
 * themes with no variant needed. Use those. */
const FIELD =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30:text-emerald-400/40";

const LABEL = "text-xs font-semibold text-foreground";

/** A titled, colour-headed panel. The icon + tinted header is what
 * makes the form scannable without reading every label. */
function Section({
  icon: Icon,
  title,
  hint,
  accent = true,
  children,
}: {
  icon: typeof FileText;
  title: string;
  hint?: string;
  /** Tinted surface + left accent rail. Used for the PHOTO sections so
   * they are recognisable at a glance while scanning past text fields —
   * same footprint, more contrast. */
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border shadow-xs ${
        accent ? "border-primary/25 border-l-4 border-l-primary bg-primary/5" : "border-border bg-card"
      }`}
    >
      <header
        className={`flex items-baseline gap-2 border-b px-4 py-2.5 ${
          accent ? "border-primary/20 bg-primary/10" : "border-border bg-muted/40"
        }`}
      >
        <Icon className={`size-4 shrink-0 translate-y-0.5 ${accent ? "text-primary" : "text-primary"}`} />
        <h2 className={`text-xs font-bold uppercase tracking-wider ${accent ? "text-primary" : "text-foreground"}`}>{title}</h2>
        {hint && <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">{hint}</span>}
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

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

  // Collapsible sections — the form is long and dense, so let users hide what they don't need to see.
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [photosOpen, setPhotosOpen] = useState(true);
const [pricingOpen, setPricingOpen] = useState(true);

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
  /** Lets "Save changes" persist roof areas too — the per-area
   * "Save Area" button is gone, so this form is now the ONLY way area
   * edits reach the database. */
  const roofAreasRef = useRef<RoofingAreasEditorV2Ref>(null);
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

  // Seeds the preview from the persisted figures for ANY roofing
  // estimate (refreshRoofingTotals keeps it live after each area save).
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

  // Scope already recorded? Then the type is fixed — same rule
  // EstimateService.update enforces, surfaced early.
  const typeLocked = !!estimate && (lineItems.length > 0 || roofingAreas.length > 0);

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
  //
  // Gated on estimateType, NOT roofV2 — third instance of the same
  // root cause. On /estimates/[id]/edit (roofV2 false) a ROOFING
  // estimate fell through to summing `lineItems`, i.e. its dead
  // estimate_items rows, and previewed "Total: $9.00" against a real
  // total of $24.
  const subtotal = estimateType === "roofing"
    ? (roofingTotals?.subtotal ?? 0)
    : calculateSubtotal(lineItems.map((li) => ({ total: calculateLineItemTotal(li) })));
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
        // Roofing scope lives in roof areas — EstimateService rejects
        // this call for a roofing estimate, so don't make it.
        if (estimateType !== "roofing") {
          await estimateService.updateLineItems(estimate.id, lineItems);
        } else {
          // Saves every roof area AND its line items. Throws on the
          // first failure, which the catch below surfaces — so a
          // partial save never navigates away looking successful.
          //
          // Deliberately NOT `?.` — an optional chain here silently
          // discards every area edit if the ref is ever unattached,
          // which is precisely what happened when this was first wired
          // up (the ref prop was missing, the call no-oped, and the
          // form redirected as though it had saved). Fail loudly.
          if (!roofAreasRef.current) {
            throw new Error("Roof area editor is not ready — please try again.");
          }
          await roofAreasRef.current.saveAll();
        }
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
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-5 pb-40 lg:pb-28">
      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      {/* ---------- 1. CLIENT & PROJECT ---------- */}
      <Section icon={Building2} title="Client & Project" hint="Who this estimate is for">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className={LABEL}>Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={FIELD}
            >
              <option value="">Auto — use the client’s project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Leave on Auto and the client’s project is used, or created for them.
              </p>
              <button
                type="button"
                onClick={() => setShowNewProjectModal(true)}
                className="shrink-0 text-xs font-semibold text-primary hover:underline"
              >
                + New Project
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={LABEL}>Client</label>
            {selectedProject?.clientId ? (
              <div className="flex h-[38px] items-center rounded-lg border border-input bg-muted px-3 text-sm font-medium text-foreground">
                {clients.find((c) => c.id === selectedProject.clientId)?.name ?? "Auto-loaded from project"}
              </div>
            ) : (
              <>
                <select
                  value={manualClientId}
                  onChange={(e) => setManualClientId(e.target.value)}
                  className={FIELD}
                >
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowNewClientModal(true)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    + New Client
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </Section>

      {/* ---------- 2. ESTIMATE DETAILS ---------- */}
<Section icon={FileText} title="Estimate Details" accent>
  {/* Toggle button – stays above the fields */}
  <div className="flex justify-end -mt-1 mb-2">
    <button
      type="button"
      onClick={() => setDetailsOpen(!detailsOpen)}
      className="text-muted-foreground hover:text-foreground transition-transform"
      aria-label={detailsOpen ? "Collapse details" : "Expand details"}
    >
      <svg
        className={`w-4 h-4 transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  </div>

  {/* Collapsible content – all original fields remain untouched */}
  <div
    className={`overflow-hidden transition-all duration-200 ease-in-out ${
      detailsOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
    }`}
  >
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={LABEL}>Title *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Short title for this estimate"
          className={FIELD}
        />
      </div>

      <div className="space-y-1.5">
        <label className={LABEL}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Project overview shown on the estimate and its PDF"
          className={FIELD}
        />
      </div>

      {/* Estimate Type – unchanged */}
      {!roofV2 && (
        <div className="space-y-2">
          <label className={LABEL}>Estimate Type</label>
          {typeLocked && (
            <p className="rounded-md bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">
              Locked — this estimate already has {estimateType === "roofing" ? "roof areas" : "line items"} recorded. Create a new estimate to change its type.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${estimateType === "standard" ? "border-primary bg-primary/5" : "border-input"} ${typeLocked ? "cursor-not-allowed opacity-60" : "hover:bg-muted/60:bg-emerald-900/20"}`}>
              <input
                type="radio"
                name="estimateType"
                value="standard"
                checked={estimateType === "standard"}
                disabled={typeLocked}
                onChange={(e) => setEstimateType(e.target.value as "standard" | "roofing")}
                className="size-4 accent-[var(--primary)] disabled:opacity-50"
              />
              <span className="text-sm font-medium text-foreground">Standard (Line Items)</span>
            </label>
            <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${estimateType === "roofing" ? "border-primary bg-primary/5" : "border-input"} ${typeLocked ? "cursor-not-allowed opacity-60" : "hover:bg-muted/60:bg-emerald-900/20"}`}>
              <input
                type="radio"
                name="estimateType"
                value="roofing"
                checked={estimateType === "roofing"}
                disabled={typeLocked}
                onChange={(e) => setEstimateType(e.target.value as "standard" | "roofing")}
                className="size-4 accent-[var(--primary)] disabled:opacity-50"
              />
              <span className="text-sm font-medium text-foreground">Roofing (Areas)</span>
            </label>
          </div>
        </div>
      )}
    </div>
  </div>
</Section>

      {/* ---------- 5. ATTACHMENTS (estimate-level) ----------
          Retitled from a bare "Photos": the roof-area cards below have
          their OWN photo uploads, and two identically-labelled sections
          on one page is exactly why the per-area one was unfindable. */}
{estimate && (
  <Section icon={Camera} title="Estimate Photos" hint="Apply to the whole estimate" accent>
    {/* Toggle button – placed inside the Section so it appears on the right */}
    <div className="flex justify-end -mt-1 mb-2">
      <button
        type="button"
        onClick={() => setPhotosOpen(!photosOpen)}
        className="text-muted-foreground hover:text-foreground transition-transform"
        aria-label={photosOpen ? "Collapse photos" : "Expand photos"}
      >
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${photosOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>

    {/* Collapsible content – the photo editor */}
    <div
      className={`overflow-hidden transition-all duration-200 ease-in-out ${
        photosOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
      }`}
    >
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
  </Section>
)}

      {estimateType === "roofing" && (
        <>
          {estimate && profile?.companyId ? (
            <Section icon={Home} title="Scope — Roof Areas" hint="Each area has its own photos">
              {/* V2 for every roofing estimate, not just the
                  /estimates-roof route. Which editor appeared used to
                  depend on the ROUTE (`roofV2`), and the V1 editor only
                  edits `area_total` — a field that feeds NO total. A
                  roofing estimate opened at /estimates/[id]/edit
                  therefore showed no Material/Labor/Tax inputs and no
                  Estimated Repair Cost, which is where its money
                  actually lives (see getScopeLines). Same root cause as
                  the line-item editor below: the editor was chosen by
                  the URL instead of by the data. */}
              <RoofingAreasEditorV2
                  ref={roofAreasRef}
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
            </Section>
          ) : (
            <Section icon={Home} title="Scope — Roof Areas">
              <p className="text-sm text-muted-foreground">
                Create the estimate first, then you&apos;ll be able to add roof areas and photos on the edit page.
              </p>
            </Section>
          )}
        </>
      )}

      {/* Gated on estimateType, NOT on the roofV2 route prop.
          Previously `!roofV2`, which meant a ROOFING estimate opened
          via /estimates/[id]/edit still rendered this editor — its rows
          save to estimate_items, which contribute nothing to a roofing
          estimate's total (that comes from roof areas). A user edited a
          line from $10 to $9, saw it save, and the total never moved.
          EstimateService now refuses such a write outright; this stops
          the UI offering it in the first place. */}
      {estimateType !== "roofing" && (
        <Section icon={ListChecks} title="Scope — Line Items">
          <LineItemEditor items={lineItems} onChange={setLineItems} />
        </Section>
      )}

      {/* ---------- 6. PRICING & TOTALS ---------- */}
<Section icon={Calculator} title="Pricing & Totals">
  <div className="flex justify-end -mt-1">
    <button
      type="button"
      onClick={() => setPricingOpen(!pricingOpen)}
      className="text-muted-foreground hover:text-foreground transition-transform p-1"
      aria-label={pricingOpen ? "Collapse" : "Expand"}
    >
      <svg
        className={`w-4 h-4 transition-transform duration-200 ${pricingOpen ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  </div>

  <div
    className={`overflow-hidden transition-all duration-200 ease-in-out ${
      pricingOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
    }`}
  >
    <div className="space-y-2 pt-1">
      {/* Four fields in a tight grid */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <div className="space-y-0.5">
          <label className="block text-[9px] font-medium text-foreground/70 uppercase tracking-wider">Markup</label>
          <input
            type="number"
            step="any"
            value={markup}
            onChange={(e) => setMarkup(parseFloat(e.target.value) || 0)}
            className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs focus:border-ring focus:outline-none"
          />
        </div>
        <div className="space-y-0.5">
          <label className="block text-[9px] font-medium text-foreground/70 uppercase tracking-wider">Discount</label>
          <input
            type="number"
            step="any"
            value={discount}
            onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
            className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs focus:border-ring focus:outline-none"
          />
        </div>
        <div className="space-y-0.5">
          <label className="block text-[9px] font-medium text-foreground/70 uppercase tracking-wider">Tax %</label>
          <input
            type="number"
            step="any"
            value={taxRate}
            onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
            className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs focus:border-ring focus:outline-none"
          />
        </div>
        <div className="space-y-0.5">
          <label className="block text-[9px] font-medium text-foreground/70 uppercase tracking-wider">Deposit</label>
          <input
            type="number"
            step="any"
            value={depositAmount}
            onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0)}
            className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs focus:border-ring focus:outline-none"
          />
        </div>
      </div>

      {/* Total card – much smaller */}
      <div className="flex items-baseline justify-between rounded border border-border bg-muted/50 px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</span>
        <span className="text-lg font-bold text-foreground">{formatMoney(total)}</span>
      </div>
    </div>
  </div>
</Section>

      {/* ---------- STICKY ACTIONS ----------
          Offset by the 65px mobile bottom nav so the Save button is
          never hidden behind it; flush to the viewport from lg up,
          where that nav isn't rendered. Carries the total too, so the
          number stays visible however far down the form you are. */}
      <div className="sticky bottom-[65px] z-30 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80:bg-emerald-950/80 sm:-mx-6 sm:px-6 lg:bottom-0">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</div>
            <div className="truncate text-lg font-bold text-foreground">{formatMoney(total)}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border border-input px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted:bg-emerald-900/40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || (!projectId && !manualClientId)}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : estimate ? "Save changes" : "Create estimate"}
            </button>
          </div>
        </div>
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
