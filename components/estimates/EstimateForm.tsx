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
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ROOFING_AREA_QUANTITY_UNITS } from "@/lib/services/roofingAreaService";
import type { RoofingAreaTemplate } from "@/lib/services/roofingAreaTemplateService";
import type { DraftAreaLineItem } from "@/components/estimates/RoofingAreaLineItemEditor";

/** "flat" makes every Section a heading with a divider instead of a bordered card. */
const SectionStyleContext = createContext<"card" | "flat" | "document">("card");
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { hidesMobileBottomNav } from "@/lib/layout/mobileBottomNav";
import { Building2, FileText, Home, ListChecks, Calculator, Camera } from "lucide-react";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { LineItemEditor, type DraftLineItem } from "./LineItemEditor";
import { RoofingAreasEditorV2, type RoofingAreasEditorV2Ref } from "./RoofingAreasEditorV2";
import { EstimatePhotosEditor } from "./EstimatePhotosEditor";
import { ROOFING_LINE_ITEMS_ENABLED } from "@/lib/featureFlags";
import { Modal } from "@/components/ui/Modal";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { PropertyForm } from "@/components/properties/PropertyForm";
import { formatPropertyAddress, type Property } from "@/lib/services/propertyService";
import { ClientForm } from "@/components/clients/ClientForm";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import { calculateSubtotal, calculateLineItemTotal, calculateDocumentTotal, calculateAreaRepairCost } from "@/lib/services/financialCalculations";
import { createEstimateForClient } from "@/lib/services/estimateCreationWorkflow";
import { EMERGENCY_ROOF_RESPONSE_TEMPLATE, EMERGENCY_ROOF_AREA_TEMPLATE } from "@/lib/estimateQuickTemplates";
import { autoResizeTextarea } from "@/lib/autoResizeTextarea";
import type { Estimate, EstimateLineItem } from "@/lib/services/estimateService";
import {
  ESTIMATE_TERMS_TEMPLATE_OPTIONS,
  DEFAULT_ESTIMATE_TERMS_TEMPLATE,
  type EstimateTermsTemplateKey,
} from "@/lib/estimateTerms";
import type { EstimatePhoto } from "@/lib/services/estimatePhotoService";
import type { RoofingArea } from "@/lib/services";
import type { Project } from "@/lib/services/projectService";
import type { Client } from "@/lib/services/clientService";
import type { CompanyProfile } from "@/lib/services/companyProfileService";

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
  headerRight,
  accent = true,
  flush = false,
  children,
}: {
  icon: typeof FileText;
  title: string;
  hint?: string;
  /** Renders inline in the header row, right-aligned — e.g. the
   * Standard/Roofing pill toggle. Replaces the old pattern of
   * absolutely-positioning controls over the body and padding the
   * body down to clear them (which is where the extra top gap on
   * "Client & Project" came from). */
  headerRight?: ReactNode;
  /** Tinted surface + left accent rail. Used for the PHOTO sections so
   * they are recognisable at a glance while scanning past text fields —
   * same footprint, more contrast. */
  accent?: boolean;
  /** Drop the body padding so children sit flush against the section
   * border.
   *
   * For "Scope — Roof Areas", whose children are ALREADY self-contained
   * bordered cards with their own green header bars. Padding there
   * produced a box inside a box: a green section header, a 12px inset,
   * then a green area header — two frames of chrome and a wasted gutter
   * on each side for no separation the area's own border wasn't already
   * providing. Flush, the section header reads as the heading FOR the
   * area cards rather than as a second container around them.
   *
   * Only for children that are full-width blocks; bare form fields
   * still want the padded default. */
  flush?: boolean;
  children: ReactNode;
}) {
  const style = useContext(SectionStyleContext);
  if (style === "document") {
    // Estimate design: a white card with a serif heading.
    return (
      <section className="rounded-xl border border-[#E2E5E0] bg-white p-4">
        <header className="mb-2.5 flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-[#5B6675]" />
          <h2 className="font-[family-name:var(--font-doc-display)] text-[15px] font-semibold text-[#1B2430]">{title}</h2>
          {hint && <span className="ml-1 hidden text-[13px] text-[#8A93A0] sm:block">{hint}</span>}
          {headerRight && <span className="ml-auto">{headerRight}</span>}
        </header>
        <div className="space-y-3">{children}</div>
      </section>
    );
  }
  if (style === "flat") {
    return (
      <section className="space-y-4 border-t border-border pt-5 first:border-t-0 first:pt-0">
        <header className="flex items-baseline gap-2">
          <Icon className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {hint && <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">{hint}</span>}
          {headerRight && <span className={hint ? "" : "ml-auto"}>{headerRight}</span>}
        </header>
        <div>{children}</div>
      </section>
    );
  }
  return (
    <section
      className={`overflow-hidden rounded-xl border shadow-xs ${
        accent ? "border-primary/25 border-l-4 border-l-primary bg-primary/5" : "border-border bg-card"
      }`}
    >
      <header
        className={`flex items-baseline gap-2 border-b px-3 py-2.5 sm:px-4 ${
          accent ? "border-primary/20 bg-primary/10" : "border-border bg-muted/40"
        }`}
      >
        <Icon className={`size-4 shrink-0 translate-y-0.5 ${accent ? "text-primary" : "text-primary"}`} />
        <h2 className={`text-xs font-bold uppercase tracking-wider ${accent ? "text-primary" : "text-foreground"}`}>{title}</h2>
        {hint && <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">{hint}</span>}
        {headerRight && <span className={hint ? "" : "ml-auto"}>{headerRight}</span>}
      </header>
      {/* 12px of inner padding on phones, the original 16px from `sm`
          up. Section padding stacks on top of the page gutter, so this
          is 8px of usable width per row recovered where it is scarcest.
          `flush` drops it entirely — see the prop's note. */}
      {/* `flush` keeps a bottom gutter only: the section header then
          butts directly against the first area's own header (the point
          of combining them), while the trailing "Add Another Area"
          button still gets clearance from the section's bottom border
          instead of sitting on it. */}
      <div className={flush ? "px-2 pb-2" : "space-y-4 p-3 sm:p-4"}>{children}</div>
    </section>
  );
}

const STEP_LABELS = ["Client", "Job and roof areas", "Pricing"];

/** The area that holds item and labour rows which are not roof work. */
const GENERAL_AREA_NAME = "General items";

// Document-style tables (the cost-estimate layout).
const DOC_TABLE = "w-full border-collapse text-[13px]";
const DOC_BAND = "bg-[#F8F9F7] text-[#5B6675]";
const DOC_BODY = "border border-[#E2E5E0] bg-white";
const DOC_ROW = "border-t border-[#E2E5E0]";
const DOC_LABEL = "w-28 bg-[#F8F9F7] px-3 py-1 text-[#5B6675]";
const DOC_VALUE = "px-3 py-1";
const DOC_FIELD = "w-full rounded-lg border border-[#D0D5CD] bg-white px-2 py-1 text-[#1B2430]";
// Inputs in the item, labour, and totals tables look like plain text until hovered or focused.
const DOC_CELL_INPUT = "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[#1B2430] outline-none hover:border-[#D0D5CD] focus:border-[#0E7C7B]";

const DOC_COMPACT_CONTROL = "h-8 w-full rounded-lg border border-[#D0D5CD] bg-white px-2.5 text-[13px] text-[#1B2430] focus:border-[#0E7C7B] focus:outline-none";

const FORM_CONTROL = "h-9 rounded-lg border border-[#D0D5CD] bg-white px-2.5 text-[13px] text-[#1B2430] focus:border-[#0E7C7B] focus:outline-none";

export function EstimateForm({
  estimate,
  lineItems: initialLineItems,
  roofV2 = false,
  basePath = "/estimates",
  layout = "classic",
}: {
  estimate?: Estimate;
  /** "steps" shows one part at a time; "flat" shows everything on one page with fewer boxes; "classic" is the default. */
  layout?: "classic" | "steps" | "flat" | "document";
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
  // This form serves both /new and /edit; only the latter hides the
  // mobile bottom nav, and the sticky bar's offset must match whichever
  // route it is on or it floats above (or under) the wrong thing.
  const navHidden = hidesMobileBottomNav(usePathname());
  const searchParams = useSearchParams();
  const { estimateService, projectService, clientService, propertyService, roofingAreaService, roofingAreaTemplateService, estimatePhotoService, companyProfileService } = useServices();
  const { profile } = useAuth();

  // Collapsible sections — the form is long and dense, so let users hide what they don't need to see.
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [photosOpen, setPhotosOpen] = useState(true);
const [pricingOpen, setPricingOpen] = useState(true);
  const [step, setStep] = useState(1);
  const showStep = (n: number) => layout !== "steps" || step === n;
  const patchArea = (id: string, patch: Partial<RoofingArea>) =>
    setRoofingAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAreaRow = (id: string) => setRoofingAreas((prev) => prev.filter((a) => a.id !== id));
  const seededRef = useRef(false);
  // Each roof area's line items as the editor shows them (document layout tables).
  const [areaLineItems, setAreaLineItems] = useState<Record<string, DraftAreaLineItem[]>>({});
  // Saved roof-area templates for the top-of-form dropdown (document layout only).
  const [savedAreaTemplates, setSavedAreaTemplates] = useState<RoofingAreaTemplate[]>([]);
  useEffect(() => {
    if (layout !== "document" || !profile?.companyId) return;
    roofingAreaTemplateService
      .listForCompany(profile.companyId)
      .then(setSavedAreaTemplates)
      .catch(() => setSavedAreaTemplates([]));
  }, [layout, profile?.companyId, roofingAreaTemplateService]);
  const addAreaRow = (name?: string) =>
    setRoofingAreas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        estimateId: estimate?.id ?? "",
        areaName: name ?? `Item ${prev.length + 1}`,
        sequenceNumber: prev.length,
        scopeItems: "",
        areaTotal: 0,
        quantity: 1,
        quantityUnit: "EA",
        defect: null,
        location: null,
        correctiveAction: null,
        materialsIncluded: null,
        materialCost: 0,
        laborCost: 0,
        tax: 0,
        estimatedRepairCost: 0,
      } as unknown as RoofingArea,
    ]);

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
  // Property for an estimate that is on Auto (no project picked). Lists the
  // chosen client's properties; the choice decides which job the estimate
  // goes to, so an estimate for one house never lands on another house's job.
  const [clientProperties, setClientProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [showNewPropertyModal, setShowNewPropertyModal] = useState(false);
  // Read-only label when a project is picked and that project has a property.
  const [pickedProjectProperty, setPickedProjectProperty] = useState<Property | null>(null);
  const [title, setTitle] = useState(estimate?.title ?? "");
  const [description, setDescription] = useState(estimate?.description ?? "");
  // True while focus is inside the Title / Scope / Area block; the other
  // document sections dim so the block being edited stands out.
  const [areaFocused, setAreaFocused] = useState(false);
  const focusBlockRef = useRef<HTMLDivElement>(null);
  // Clicking anywhere outside the block ends the focus, including plain
  // background that never takes focus (focus-based checks miss those).
  useEffect(() => {
    if (!areaFocused) return;
    const onPointerDown = (e: PointerEvent) => {
      if (focusBlockRef.current && !focusBlockRef.current.contains(e.target as Node)) setAreaFocused(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [areaFocused]);
  // A ref (not just the onChange resize) so the "Load Emergency
  // Response Template" button below — which sets this via
  // setDescription programmatically, not through the textarea's own
  // onChange — also resizes the box instead of leaving it at whatever
  // size it was before the template filled it in.
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    autoResizeTextarea(descriptionRef.current);
  }, [description]);
  const [estimateType, setEstimateType] = useState<"standard" | "roofing">(estimate?.estimateType ?? (roofV2 ? "roofing" : "standard"));
  /** Independent of estimateType — Roofing/Custom/Home Remodel are
   * legal-language categories, not the standard/roofing scope model.
   * Frozen onto the estimate at save; see lib/estimateTerms.ts for why
   * only the KEY is persisted, never the template text. */
  const [termsTemplate, setTermsTemplate] = useState<EstimateTermsTemplateKey>(
    estimate?.termsTemplate ?? DEFAULT_ESTIMATE_TERMS_TEMPLATE
  );
  /** Which customer-facing brand this estimate presents as (PDF/email/
   * portal) — see CompanyProfileService. Empty string = the company's
   * own default identity (profileId: null), exactly today's behavior
   * for any estimate that never touches this field. */
  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [profileId, setProfileId] = useState(estimate?.profileId ?? "");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [lineItems, setLineItems] = useState<DraftLineItem[]>(
    initialLineItems?.map((li) => ({ category: li.category, name: li.name, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, unit: li.unit ?? null, taxable: li.taxable, groupName: li.groupName ?? null })) ?? []
  );
  const [roofingAreas, setRoofingAreas] = useState<RoofingArea[]>([]);
  // A new document-style estimate starts with the general area that holds non-roof items.
  useEffect(() => {
    if (layout !== "document" || estimate || estimateType !== "roofing" || seededRef.current) return;
    seededRef.current = true;
    if (!roofingAreas.some((a) => a.areaName === GENERAL_AREA_NAME)) addAreaRow(GENERAL_AREA_NAME);
  }, [layout, estimate, estimateType, roofingAreas.length]);
  const { ask, dialog } = useConfirmDialog();
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

  // Auto path (no project picked): list the chosen client's properties.
  // One property is picked for the office; several means the office must choose.
  useEffect(() => {
    if (!profile?.companyId || projectId || !manualClientId) {
      setClientProperties([]);
      setPropertyId("");
      return;
    }
    propertyService
      .list({ companyId: profile.companyId, clientId: manualClientId })
      .then((list) => {
        setClientProperties(list);
        setPropertyId(list.length === 1 ? list[0].id : "");
      })
      .catch(() => {
        // Properties are additive: without them the estimate saves as before.
        setClientProperties([]);
        setPropertyId("");
      });
  }, [propertyService, profile?.companyId, projectId, manualClientId]);

  // A picked project's property, shown read-only on the form.
  const pickedProjectPropertyId = projects.find((p) => p.id === projectId)?.propertyId ?? null;
  useEffect(() => {
    if (!pickedProjectPropertyId) {
      setPickedProjectProperty(null);
      return;
    }
    propertyService
      .getById(pickedProjectPropertyId, true)
      .then(setPickedProjectProperty)
      .catch(() => setPickedProjectProperty(null));
  }, [propertyService, pickedProjectPropertyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    companyProfileService.listForCompany(profile.companyId).then(setProfiles);
  }, [companyProfileService, profile?.companyId]);

  useEffect(() => {
    if (!estimate || estimateType !== "roofing") return;
    roofingAreaService.listForEstimate(estimate.id).then(setRoofingAreas);
  }, [estimate, estimateType, roofingAreaService]);

  /** "New Estimate" from /roof-templates lands here with ?templateId=
   * (a saved roofing_area_templates row) or ?templateKey= (the built-in
   * EMERGENCY_ROOF_AREA_TEMPLATE preset) — prefill a first area from it
   * so the technician doesn't have to add-area-then-load-template as a
   * second step. Only for a brand-new roofing estimate with no areas
   * yet; never overwrites an existing draft's areas. */
  useEffect(() => {
    if (estimate || estimateType !== "roofing" || roofingAreas.length > 0) return;
    const templateKey = searchParams.get("templateKey");
    if (templateKey && templateKey === EMERGENCY_ROOF_AREA_TEMPLATE.key) {
      const t = EMERGENCY_ROOF_AREA_TEMPLATE;
      setRoofingAreas([
        {
          id: crypto.randomUUID(),
          estimateId: "",
          companyId: "",
          areaName: t.areaName,
          sequenceNumber: 0,
          scopeItems: t.scopeItems,
          areaTotal: 0,
          measurements: "",
          inspectionNotes: "",
          notes: "",
          quantity: t.quantity,
          quantityUnit: t.quantityUnit,
          defect: t.defect,
          location: t.location,
          correctiveAction: t.correctiveAction,
          materialsIncluded: t.materialsIncluded,
          materialCost: t.materialCost,
          laborCost: t.laborCost,
          tax: t.tax,
          estimatedRepairCost: calculateAreaRepairCost(t.materialCost, t.laborCost, t.tax),
        } as RoofingArea,
      ]);
      return;
    }
    const templateId = searchParams.get("templateId");
    if (!templateId || !profile?.companyId) return;
    roofingAreaTemplateService.listForCompany(profile.companyId).then((templates) => {
      const t = templates.find((tpl) => tpl.id === templateId);
      if (!t) return;
      setRoofingAreas([
        {
          id: crypto.randomUUID(),
          estimateId: "",
          companyId: "",
          areaName: t.areaName,
          sequenceNumber: 0,
          scopeItems: t.scopeItems,
          areaTotal: 0,
          measurements: "",
          inspectionNotes: "",
          notes: "",
          quantity: t.quantity,
          quantityUnit: t.quantityUnit,
          defect: t.defect,
          location: t.location,
          correctiveAction: t.correctiveAction,
          materialsIncluded: t.materialsIncluded,
          materialCost: t.materialCost,
          laborCost: t.laborCost,
          tax: t.tax,
          estimatedRepairCost: calculateAreaRepairCost(t.materialCost, t.laborCost, t.tax),
        } as RoofingArea,
      ]);
    });
  }, [estimate, estimateType, roofingAreas.length, searchParams, profile?.companyId, roofingAreaTemplateService]);

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
  // Roofing subtotal from the live form state, so it moves as the user types.
  // Same rule as the server (getScopeLines): every area line item, plus each
  // area's repair cost (material + labor + tax).
  // Estimate-level line items (the lineItems state) count too, as the saved
  // total does.
  const roofingLiveSubtotal =
    lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) +
    roofingAreas.reduce(
      (sum, area) =>
        sum +
        (areaLineItems[area.id] ?? []).reduce((s, item) => s + item.quantity * item.unitPrice, 0) +
        calculateAreaRepairCost(area.materialCost ?? 0, area.laborCost ?? 0, area.tax ?? 0),
      0
    );
  const subtotal = estimateType === "roofing"
    ? roofingLiveSubtotal
    : calculateSubtotal(lineItems.map((li) => ({ total: calculateLineItemTotal(li) })));
  const total = calculateDocumentTotal(subtotal, markup, discount, taxRate).total;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A project is no longer required up front: with a client chosen
    // and no project, createEstimateForClient resolves (or creates)
    // one. One of the two must be present.
    if (!profile?.companyId || (!projectId && !manualClientId)) return;
    if (!title.trim()) {
      setError("An estimate needs a title.");
      return;
    }
    if (!estimate && !projectId && manualClientId && clientProperties.length > 1 && !propertyId) {
      setError("This client has more than one property. Choose which one this estimate is for.");
      return;
    }
    // Which brand this estimate presents as is asked right before the
    // actual save — a confirm-and-pick step, not a field buried in the
    // form — but only when there's an actual choice to make; a company
    // with no profiles set up skips straight to saving, same as today.
    if (profiles.length > 0) {
      setError(null);
      setShowProfileModal(true);
      return;
    }
    void performSubmit();
  }

  async function performSubmit() {
    // Re-checked here (not just in handleSubmit) because this now runs
    // from the profile-confirmation modal's button too, a separate
    // call stack TypeScript can't narrow `profile` across.
    if (!profile?.companyId || (!projectId && !manualClientId)) return;
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
          termsTemplate,
          profileId: profileId || null,
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
        const { redirectTo, projectCreated, project, estimate: createdEstimate } = await createEstimateForClient(
          { projectService, estimateService },
          {
            companyId: profile.companyId,
            // Empty string means "none selected" in this <select>.
            projectId: projectId || null,
            clientId,
            clientName: clients.find((c) => c.id === clientId)?.name ?? null,
            // Only meaningful on Auto: with a project picked, that project already has its property.
            property: projectId ? null : (clientProperties.find((p) => p.id === propertyId) ?? null),
            title: title.trim(),
            description: description || undefined,
            lineItems,
            markup,
            discount,
            taxRate,
            depositAmount,
            estimateType,
            termsTemplate,
            profileId: profileId || null,
          },
          basePath
        );
        // Keep the picker honest for anyone who navigates back: an
        // auto-created project is a real project and belongs in the list.
        if (projectCreated && project) setProjects((prev) => [...prev, project]);

        // Roofing areas drafted before the estimate existed (see the
        // render-gate comment above RoofingAreasEditorV2 below) were
        // built with no real estimateId yet — saveAll's override
        // patches every one of them to the estimate we just created,
        // in the same "areas + their line items" write saveOneArea
        // always does. Skipped entirely for a standard estimate/one
        // with no areas drafted, so this is a no-op for every existing
        // caller's behavior.
        if (estimateType === "roofing" && roofingAreas.length > 0 && roofAreasRef.current) {
          await roofAreasRef.current.saveAll(createdEstimate.id);
          // saveAll's own onAreaLineItemsSaved->refreshRoofingTotals
          // still closes over the pre-creation `estimate` (undefined)
          // at this point, so it's a no-op — recompute directly here
          // instead, same call that hook would have made.
          await estimateService.recalculateTotal(createdEstimate.id);
        }
        router.push(redirectTo);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save estimate.");
    } finally {
      setSaving(false);
    }
  }

  // Title + scope overview, shared by the Area details card (roofing) and a
  // standalone card (standard estimates, which have no Area details card).
  const focusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLDivElement>) => {
      if (areaFocused) return;
      setAreaFocused(true);
      e.currentTarget.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Escape") return;
      (document.activeElement as HTMLElement | null)?.blur();
      setAreaFocused(false);
    },
  };
  // Left rail that marks the block being edited.
  const focusRail = areaFocused && (
    <span aria-hidden className="pointer-events-none absolute -left-2.5 inset-y-0 w-1 rounded-full bg-[#0E7C7B]" />
  );

  const titleScopeFields = (
    <div className="space-y-2">
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[#5B6675]">
        Title *
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example, Front slope repair" aria-label="Title" className={DOC_COMPACT_CONTROL} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[#5B6675]">
        Scope overview, shown on the PDF
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Describe the work in a sentence or two" aria-label="Scope" className="resize-y rounded-lg border border-[#D0D5CD] bg-white px-2.5 py-1.5 text-[13px] text-[#1B2430] focus:border-[#0E7C7B] focus:outline-none" />
      </label>
    </div>
  );

  return (
    <SectionStyleContext.Provider value={layout === "document" ? "document" : layout === "flat" ? "flat" : "card"}>
    <>
    {/* Trailing padding clears the sticky action bar, plus the bottom
        nav when it's there — 65px less to reserve when it isn't. */}
    <form
      onSubmit={handleSubmit}
      onFocusCapture={(e) => {
        if (focusBlockRef.current && !focusBlockRef.current.contains(e.target as Node)) setAreaFocused(false);
      }}
      className={`${layout === "document" ? "w-full" : "mx-auto max-w-6xl"} lg:pb-28 ${navHidden ? "pb-24" : "pb-40"} ${
        layout === "document"
          ? "w-full lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5"
          : "space-y-4"
      }`}
    >
      {layout === "document" && (
        <div className="col-span-full mb-3 flex flex-wrap items-center gap-3 border-b border-[#E2E5E0] pb-3 lg:col-span-2">
          <Link href={basePath} className="shrink-0 text-xs font-medium text-[#5B6675] hover:text-[#1B2430]">
            ← Estimates
          </Link>
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[#E2E5E0]" />
          <span className="font-[family-name:var(--font-doc-display)] text-lg font-semibold text-[#8A93A0]">
            {title.trim() || "Untitled estimate"}
          </span>
          <div role="radiogroup" aria-label="Estimate type" className="ml-auto flex gap-0.5 rounded-[10px] bg-[#EEF0EC] p-[3px] text-[13px]">
            {(["roofing", "standard"] as const).map((t) => {
              const active = estimateType === t;
              return (
                <label
                  key={t}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-1.5 ${
                    active ? "bg-white font-semibold text-[#1B2430] shadow-sm" : "text-[#5B6675]"
                  } ${typeLocked ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <input type="radio" name="estimate-type" value={t} checked={active} disabled={typeLocked} onChange={() => setEstimateType(t)} className="sr-only" />
                  {t === "roofing" ? "Roofing" : "Standard"}
                </label>
              );
            })}
          </div>
        </div>
      )}


      {layout === "steps" && (
        <nav aria-label="Estimate steps" className="flex flex-wrap items-center gap-2 text-sm">
          {STEP_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i + 1)}
              aria-current={step === i + 1 ? "step" : undefined}
              className={`rounded-full px-3 py-1 ${step === i + 1 ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}
            >
              {i + 1}. {label}
            </button>
          ))}
        </nav>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      {/* Compact metadata — Client & Project and Estimate Details are
          document metadata, not the workspace, so they run full-width
          above the two-column split rather than competing with Line
          Items for the wide left column. */}
      <div className={layout === "document" ? "space-y-3 lg:col-start-1 lg:row-start-2" : "space-y-4"}>

      {layout === "document" && estimateType === "roofing" && (
        <div className="col-span-full flex flex-wrap items-center gap-2 lg:col-span-2">
          <button
            type="button"
            onClick={() => roofAreasRef.current?.addEmergencyArea()}
            className={buttonClass("secondary", "h-8")}
          >
            + {EMERGENCY_ROOF_AREA_TEMPLATE.label}
          </button>
          {savedAreaTemplates.length > 0 && (
            <select
              value=""
              aria-label="Load a saved template"
              onChange={(e) => {
                const t = savedAreaTemplates.find((x) => x.id === e.target.value);
                if (t) roofAreasRef.current?.addFromTemplate(t);
              }}
              className="h-[34px] rounded-lg border border-[#D0D5CD] bg-white px-2 text-[13px] text-[#1B2430]"
            >
              <option value="">Load a saved template…</option>
              {savedAreaTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>
      )}





      {layout === "document" && areaFocused && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-20 bg-[#1B2430]/95 transition-opacity duration-200" />
      )}
      {layout === "document" && (() => {
        const selectedClient = clients.find((c) => c.id === manualClientId);
        return (
          <>
          <div className="rounded-xl border border-[#E2E5E0] bg-white p-3">
            <div id="client" className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-baseline gap-2 text-xs font-medium text-[#5B6675]">
                  <span>Client</span>
                  <span className="min-w-0 truncate text-[11px] font-normal text-[#8A93A0]">
                    Phone {selectedClient?.phone || "—"} · Email {selectedClient?.email || "—"}
                  </span>
                  <button type="button" onClick={() => setShowNewClientModal(true)} className="ml-auto shrink-0 text-[11px] font-medium text-[#0E7C7B] hover:underline">
                    + New client
                  </button>
                </div>
                <select value={manualClientId} onChange={(e) => setManualClientId(e.target.value)} aria-label="Client" className={DOC_COMPACT_CONTROL}>
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[#5B6675]">
                Property
                <span className="flex items-center gap-2">
                  <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label="Property" className={`${DOC_COMPACT_CONTROL} min-w-0 flex-1`}>
                    <option value="">{clientProperties.length > 1 ? "Choose a property…" : "No property"}</option>
                    {clientProperties.map((p) => (
                      <option key={p.id} value={p.id}>{p.nickname || formatPropertyAddress(p)}</option>
                    ))}
                  </select>
                  {manualClientId && (
                    <button type="button" onClick={() => setShowNewPropertyModal(true)} className="shrink-0 text-[11px] font-medium text-[#0E7C7B] hover:underline">+ New</button>
                  )}
                </span>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[#5B6675]">
                Project
                <span className="flex items-center gap-2">
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project" className={`${DOC_COMPACT_CONTROL} min-w-0 flex-1`}>
                    <option value="">Auto — use the client’s project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setShowNewProjectModal(true)} className="shrink-0 text-[11px] font-medium text-[#0E7C7B] hover:underline">+ New</button>
                </span>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[#5B6675]">
                Terms
                <select value={termsTemplate} onChange={(e) => setTermsTemplate(e.target.value as EstimateTermsTemplateKey)} aria-label="Terms and conditions" className={DOC_COMPACT_CONTROL}>
                  {ESTIMATE_TERMS_TEMPLATE_OPTIONS.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          </>
        );
      })()}

            {layout !== "document" && (<>
      {/* ---------- 1. CLIENT & PROJECT ---------- */}
{showStep(1) && (
  <Section
    icon={Building2}
    title="Client & Project"
    headerRight={
      !roofV2 && (
        <div className="flex gap-0.5">
          <label
        className={`flex cursor-pointer items-center rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
          estimateType === "standard"
            ? "border-primary bg-primary text-white"
            : "border-input bg-transparent text-muted-foreground hover:bg-muted/30"
        } ${typeLocked ? "cursor-not-allowed  " : ""}`}
      >
            <input
              type="radio"
              name="estimateType"
              value="standard"
              checked={estimateType === "standard"}
              disabled={typeLocked}
              onChange={(e) => setEstimateType(e.target.value as "standard" | "roofing")}
              className="hidden"
            />
            Standard
          </label>
          <label
        className={`flex cursor-pointer items-center rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
          estimateType === "roofing"
            ? "border-primary bg-primary text-white"
            : "border-input bg-transparent text-muted-foreground hover:bg-muted/30"
        } ${typeLocked ? "cursor-not-allowed  " : ""}`}
      >
            <input
              type="radio"
              name="estimateType"
              value="roofing"
              checked={estimateType === "roofing"}
              disabled={typeLocked}
              onChange={(e) => setEstimateType(e.target.value as "standard" | "roofing")}
              className="hidden"
            />
            Roofing
          </label>
        </div>
      )
    }
  >
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Project column – unchanged */}
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

        {/* Client column – unchanged */}
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

          {!projectId && manualClientId && (
            <div className="space-y-1.5 pt-1">
              <label className={LABEL}>Property</label>
              <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={FIELD}>
                <option value="">{clientProperties.length > 1 ? "Choose a property…" : "No property"}</option>
                {clientProperties.map((p) => (
                  <option key={p.id} value={p.id}>{p.nickname || formatPropertyAddress(p)}</option>
                ))}
              </select>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  The estimate goes to the job for this house, or a new job is created for it.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewPropertyModal(true)}
                  className="shrink-0 text-xs font-semibold text-primary hover:underline"
                >
                  + New Property
                </button>
              </div>
            </div>
          )}

          {projectId && pickedProjectProperty && (
            <p className="text-[11px] text-muted-foreground">Property: {formatPropertyAddress(pickedProjectProperty)}</p>
          )}
        </div>
      </div>

      {typeLocked && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Locked — has {estimateType === "roofing" ? "roof areas" : "line items"}
        </p>
      )}
    </div>
  </Section>
)}
</>)}

      {/* ---------- 2. ESTIMATE DETAILS ---------- */}
{layout !== "document" && showStep(2) && (
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

  {/* Collapsible content */}
  <div
    className={`overflow-hidden transition-all duration-200 ease-in-out ${
      detailsOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
    }`}
  >
    <div className="space-y-3">
      {/* Row: Title + Terms & Conditions side by side — both are
          single-line metadata fields, so they share a row instead of
          each claiming a full-width block. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

        {/* Terms & Conditions template — the KEY is saved with the
            estimate; the text itself lives once in lib/estimateTerms.ts
            and is shown on Estimate Detail, the customer portal, and
            the PDF, all reading through the same source. */}
        <div className="space-y-1.5">
          <label className={LABEL}>Terms &amp; Conditions</label>
          <select
            value={termsTemplate}
            onChange={(e) => setTermsTemplate(e.target.value as EstimateTermsTemplateKey)}
            className={FIELD}
          >
            {ESTIMATE_TERMS_TEMPLATE_OPTIONS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label className={LABEL}>Description</label>
        <textarea
          ref={descriptionRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Project overview shown on the estimate and its PDF"
          className={`${FIELD} resize-none overflow-hidden`}
        />
      </div>

      <p className="text-[10.5px] leading-relaxed text-muted-foreground line-clamp-2">
        {ESTIMATE_TERMS_TEMPLATE_OPTIONS.find((t) => t.key === termsTemplate)?.body}
      </p>

      {/* Business Profile is chosen in a popup right at submit time
          (see the Modal below, triggered from handleSubmit) rather
          than as an always-visible field here. */}

      {/* Locked message – shown only when type is locked */}
      {typeLocked && (
        <p className="text-[10px] text-muted-foreground -mt-1">
          Locked — this estimate already has {estimateType === "roofing" ? "roof areas" : "line items"} recorded.
        </p>
      )}
    </div>
  </div>
</Section>
)}

      </div>
      {/* End compact metadata. Below: the two-column workspace — Line
          Items (and, for an edit-page roofing/photo estimate, Roof
          Areas/Photos) as the primary ~70% column, Pricing & Totals as
          a sticky ~30% sidebar. Collapses to a single stacked column
          below `lg`, in the same top-to-bottom order as before. */}
      <div className={layout === "document" ? "contents" : "lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-5"}>
      <div className={layout === "document" ? "space-y-3 lg:col-start-1 lg:row-start-3" : "space-y-4 lg:min-w-0"}>

      {/* ---------- 5. ATTACHMENTS (estimate-level) ----------
          Retitled from a bare "Photos": the roof-area cards below have
          their OWN photo uploads, and two identically-labelled sections
          on one page is exactly why the per-area one was unfindable. */}
{showStep(2) && estimate && (
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

{showStep(2) && estimateType === "roofing" && (
  <>
      {ROOFING_LINE_ITEMS_ENABLED && layout === "document" && estimateType === "roofing" && (() => {
        const generalId = roofingAreas.find((a) => a.areaName === GENERAL_AREA_NAME)?.id;
        return (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!generalId} onClick={() => generalId && roofAreasRef.current?.addLineItem(generalId, "material")} className={buttonClass("secondary", "h-8")}>
              + Add item
            </button>
            <button type="button" disabled={!generalId} onClick={() => generalId && roofAreasRef.current?.addLineItem(generalId, "labor")} className={buttonClass("secondary", "h-8")}>
              + Add labor
            </button>
          </div>
        );
      })()}

    <div ref={focusBlockRef} {...focusHandlers} className={layout !== "document" ? "contents" : estimateType === "roofing" ? "relative z-30" : "hidden"}>
    {layout === "document" && estimateType === "roofing" && (
      // Shares one outline with the Area details card below: no bottom
      // border here, the card's top border is the divider between them.
      <div className="rounded-t-xl border border-b-0 border-[#8FC4C0] bg-[#F1F7F6] p-3">{titleScopeFields}</div>
    )}
    {layout === "document" && estimateType === "roofing" && focusRail}
    <details open className={layout === "document" ? (estimateType === "roofing" ? "rounded-b-xl border border-[#8FC4C0] bg-[#F1F7F6] p-4" : "hidden") : "contents"}>
      <summary className={layout === "document" ? "mb-2.5 cursor-pointer font-[family-name:var(--font-doc-display)] text-[15px] font-semibold text-[#1B2430]" : "hidden"}>
        Area details: defects, photos, notes and templates
      </summary>
    {profile?.companyId ? (
      <RoofingAreasEditorV2
        ref={roofAreasRef}
        variant={layout === "document" ? "document" : "default"}
        onLineItemsChange={(areaId, items) => setAreaLineItems((prev) => ({ ...prev, [areaId]: items }))}
        // Empty until the estimate itself is first created — every
        // drafted area's own estimateId is patched to the real one at
        // that point (see performSubmit's saveAll(createdEstimate.id)
        // call below), so areas/photos/repair-item detail can all be
        // entered up front instead of waiting on "create the estimate
        // first." Photo upload is the one thing that still can't
        // happen pre-creation (a photo needs a real, saved area row to
        // attach to) — the upload button itself explains that inline
        // rather than the whole section being blocked.
        estimateId={estimate?.id ?? ""}
        companyId={profile.companyId}
        areas={roofingAreas}
        onChange={setRoofingAreas}
        onSave={async (area) => {
          try {
            const areaWithCompany = { ...area, companyId: profile.companyId };
            let saved: RoofingArea;
            if (area.id && area.companyId) {
              saved = await roofingAreaService.update(area.id, areaWithCompany);
            } else {
              saved = await roofingAreaService.create(areaWithCompany);
            }
            setRoofingAreas((prev) => prev.map((a) => (a.id === area.id ? saved : a)));
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
      <p className="text-sm text-muted-foreground">Loading company details…</p>
    )}
    </details>
    </div>

      {layout === "document" && estimateType === "roofing" && !estimate && (
        <section id="photos" className="rounded-xl border border-[#E2E5E0] bg-white p-4">
          <div className="mb-2.5 flex flex-wrap items-baseline gap-2">
            <h2 className="font-[family-name:var(--font-doc-display)] text-[15px] font-semibold text-[#1B2430]">Photos</h2>
            <span className="text-[13px] text-[#8A93A0]">Before and after, per area</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled
              className="h-[84px] w-[120px] rounded-[10px] border border-dashed border-[#C4CAC0] bg-white text-[13px] font-medium text-[#5B6675] disabled:cursor-not-allowed disabled:opacity-60"
            >
              + Add photo
            </button>
          </div>
          <p className="mt-3 text-xs text-[#8A93A0]">Photos are added to each area once the estimate is saved.</p>
        </section>
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
      {layout === "document" && estimateType !== "roofing" ? (
        <div ref={focusBlockRef} {...focusHandlers} className="relative z-30 space-y-3">
          {focusRail}
          <div className="rounded-xl border border-[#E2E5E0] bg-white p-3">{titleScopeFields}</div>
          {showStep(2) && (
            <Section icon={ListChecks} title="Scope — Line Items">
              <LineItemEditor items={lineItems} onChange={setLineItems} cards />
            </Section>
          )}
        </div>
      ) : (
        showStep(2) && estimateType !== "roofing" && (
          <Section icon={ListChecks} title="Scope — Line Items">
            <LineItemEditor items={lineItems} onChange={setLineItems} cards />
          </Section>
        )
      )}

      </div>
      {/* ---------- 6. PRICING & TOTALS (sticky sidebar) ----------
          sm:max-w-sm keeps this from stretching edge-to-edge with a
          loose, over-spread 4-column field grid in the tablet-width
          range below `lg` (where it isn't in the sidebar grid column
          yet, so nothing else constrains its width) — the exact range
          that read as "taking excessive space." Unconstrained again at
          `lg`, where the 320px sidebar column already does that job. */}
      {showStep(3) && (
      <div className={layout === "document" ? "lg:col-start-2 lg:row-start-2 lg:row-span-2 lg:sticky lg:top-6 lg:self-start" : "mt-4 sm:max-w-sm lg:sticky lg:top-4 lg:mt-0 lg:max-w-none"}>
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
      {layout === "document" ? (() => {
        const itemLines = estimateType === "roofing" ? roofingAreas.flatMap((area) => areaLineItems[area.id] ?? []) : lineItems;
        const sumOf = (category: "material" | "labor") =>
          itemLines.filter((item) => (category === "labor") === (item.category === "labor")).reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
        // Roofing costs are entered on each area (Material / Labor / Tax) as well as
        // in its line items, so the breakdown adds both sources.
        const areaSum = (key: "materialCost" | "laborCost" | "tax") =>
          estimateType === "roofing" ? roofingAreas.reduce((sum, area) => sum + (Number(area[key]) || 0), 0) : 0;
        const itemsSum = sumOf("material") + areaSum("materialCost");
        const laborSum = sumOf("labor") + areaSum("laborCost");
        const taxSum = areaSum("tax");
        const hasClient = !!manualClientId;
        const hasTitle = !!title.trim();
        const field = (label: string, value: number, set: (n: number) => void, suffix?: string) => (
          <div className="flex items-center justify-between gap-3">
            <span>{label}</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                value={value}
                onChange={(e) => set(parseFloat(e.target.value) || 0)}
                aria-label={label}
                className="h-[30px] w-20 rounded-md border border-[#8FC4C0] bg-white px-2 text-right text-[13px] text-[#0B5F5E] focus:border-[#0E7C7B] focus:outline-none"
              />
              {suffix && <span className="text-[13px] text-[#0B5F5E]">{suffix}</span>}
            </span>
          </div>
        );
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#8FC4C0] bg-[#F1F7F6] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#0B5F5E]">Estimate total</div>
              <div className="mt-1 font-[family-name:var(--font-doc-display)] text-[30px] font-semibold leading-none text-[#0B5F5E]">{formatMoney(total)}</div>
              <div className="mt-3 space-y-2 border-t border-[#8FC4C0] pt-3 text-[13px] text-[#0B5F5E]">
                <div className="flex justify-between"><span>Items</span><span className="font-medium">{formatMoney(itemsSum)}</span></div>
                <div className="flex justify-between"><span>Labor</span><span className="font-medium">{formatMoney(laborSum)}</span></div>
                {taxSum > 0 && <div className="flex justify-between"><span>Area tax</span><span className="font-medium">{formatMoney(taxSum)}</span></div>}
                {field("Markup", markup, setMarkup, "%")}
                {field("Discount", discount, setDiscount)}
                {field("Tax", taxRate, setTaxRate, "%")}
                {field("Deposit", depositAmount, setDepositAmount)}
              </div>
              <div className="mt-3 flex justify-between rounded-lg bg-[#0E7C7B] p-2.5 text-sm font-semibold text-white">
                <span>Balance after deposit</span>
                <span>{formatMoney(Math.max(0, total - depositAmount))}</span>
              </div>
            </div>

            <div className="rounded-xl border border-[#8FC4C0] bg-[#F1F7F6] p-4 text-[13px]">
              <div className="mb-2 font-semibold text-[#0B5F5E]">Before you create</div>
              <div className="flex flex-col gap-2">
                <span className={hasClient ? "text-[#0B5F5E]" : "text-[#B45309]"}>{hasClient ? "✓ Client chosen" : "○ Choose a client"}</span>
                <span className={hasTitle ? "text-[#0B5F5E]" : "text-[#B45309]"}>{hasTitle ? "✓ Title added" : "○ Add a title"}</span>
              </div>
            </div>
          </div>
        );
      })() : (
      <>
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
      </>
      )}
    </div>
  </div>
</Section>
      </div>
      )}
      </div>

      {/* ---------- STICKY ACTIONS ----------
          Offset by the 65px mobile bottom nav so the Save button is
          never hidden behind it; flush to the viewport from lg up,
          where that nav isn't rendered. Carries the total too, so the
          number stays visible however far down the form you are. */}
{layout === "steps" && (
  <div className="flex items-center justify-between gap-2">
    <button type="button" disabled={step === 1} onClick={() => setStep((n) => Math.max(1, n - 1))} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40">
      Back
    </button>
    <button type="button" disabled={step === STEP_LABELS.length} onClick={() => setStep((n) => Math.min(STEP_LABELS.length, n + 1))} className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-40">
      {step < STEP_LABELS.length ? `Next: ${STEP_LABELS[step]}` : "Last step"}
    </button>
  </div>
)}
<div className={`sticky bottom-0 z-30 border-t border-border bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4 ${layout === "document" ? "lg:col-span-2" : "-mx-4 sm:-mx-6"}`}>
  <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
    <div className="min-w-0">
      <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">Total</div>
      <div className="truncate text-sm font-bold text-foreground sm:text-base">{formatMoney(total)}</div>
    </div>
    <div className="flex shrink-0 gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={() => router.back()}
        className={buttonClass("secondary")}
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving || !title.trim() || (!projectId && !manualClientId)}
        className="inline-flex h-[34px] items-center rounded-lg bg-[#0E7C7B] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#0B6666] disabled:opacity-50"
      >
        {saving ? "Saving…" : estimate ? "Save Changes" : "Create"}
      </button>
    </div>
  </div>
</div>
    </form>

    <Modal open={showNewPropertyModal} onClose={() => setShowNewPropertyModal(false)} title="New Property">
      {showNewPropertyModal && manualClientId && (
        <PropertyForm
          clientId={manualClientId}
          onCancel={() => setShowNewPropertyModal(false)}
          onSaved={(created) => {
            setClientProperties((prev) => [...prev, created]);
            setPropertyId(created.id);
            setShowNewPropertyModal(false);
          }}
        />
      )}
    </Modal>
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

    <Modal
      open={showProfileModal}
      onClose={() => { if (!saving) setShowProfileModal(false); }}
      title={estimate ? "Confirm business profile" : "Which business is this estimate for?"}
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Controls the name, logo, and contact info shown on this estimate&apos;s PDF, email, and customer portal only — never the company or its financials.
        </p>
        <div>
          <label className={LABEL}>Business Profile</label>
          <select
            autoFocus
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className={FIELD}
          >
            <option value="">Company default</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.companyName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setShowProfileModal(false)}
            disabled={saving}
            className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setShowProfileModal(false);
              await performSubmit();
            }}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : estimate ? "Save Changes" : "Create Estimate"}
          </button>
        </div>
      </div>
    </Modal>
    {dialog}
    </>
    </SectionStyleContext.Provider>
  );
}
