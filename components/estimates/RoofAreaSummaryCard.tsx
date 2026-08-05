"use client";

/**
 * Read-only, compact summary card for one Roof Area — used on the
 * Estimate Detail page's "Roof Areas" section. Displays fields already
 * on the RoofingArea model (lib/services/roofingAreaService.ts); adds
 * no new calculations — `estimatedRepairCost` is read straight off the
 * row (RoofingAreaService always keeps it in sync with material/labor/
 * tax on write, see calculateAreaRepairCost in financialCalculations.ts).
 * Photos are read only for an "Images Available"/"No Images" status —
 * thumbnails are intentionally never rendered here (see
 * RoofingAreasEditorV2 / the Edit page for the full photo UI).
 */
import { useState } from "react";
import { ImageIcon, ImageOff } from "lucide-react";
import type { RoofingArea } from "@/lib/services/roofingAreaService";

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** White card background for clear readability. */
const AREA_CARD_TONE = "bg-white";

const TRUNCATE_AT = 90;

function TruncatedText({ text, className = "" }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > TRUNCATE_AT;
  return (
    <div>
      <p className={`whitespace-pre-wrap ${className} ${!expanded && isLong ? "line-clamp-2" : ""}`}>{text}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-[11px] font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function Field({ label, value, emphasize = false }: { label: string; value: string | null | undefined; emphasize?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className={`mt-0.5 text-[12px] leading-snug ${emphasize ? "font-semibold text-foreground" : "text-foreground/80"}`}>
        <TruncatedText text={value} className={emphasize ? "font-semibold text-foreground" : ""} />
      </div>
    </div>
  );
}

export function RoofAreaSummaryCard({ area, index, areaSubtotal }: { area: RoofingArea; index: number; areaSubtotal: number }) {
  const hasImages = (area.beforePhotos?.length ?? 0) > 0 || (area.afterPhotos?.length ?? 0) > 0;
  const hasDetail = area.defect || area.location || area.correctiveAction || area.materialsIncluded;
  const hasQuantity = !!area.quantity;
  const repairCost = area.estimatedRepairCost || areaSubtotal || area.areaTotal;

  return (
    <div className={`rounded-xl border border-l-4 border-border border-l-primary ${AREA_CARD_TONE} p-4 shadow-sm`}>
      {/* Header — Roof Area N + title, emphasized */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary">Roof Area {index + 1}</div>
          <div className="mt-0.5 text-base font-bold text-foreground">{area.areaName}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Est. Repair Cost</div>
          <div className="text-base font-bold text-foreground">{formatMoney(repairCost)}</div>
        </div>
      </div>

      {area.measurements && <div className="mt-1.5 text-[11px] text-muted-foreground">Measurements: {area.measurements}</div>}

      {(hasDetail || hasQuantity) && (
        <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-2.5 border-t border-border pt-3 sm:grid-cols-2">
          <Field label="Location" value={area.location} emphasize />
          <Field label="Defect" value={area.defect} />
          <Field label="Corrective Action" value={area.correctiveAction} />
          <Field label="Materials Included" value={area.materialsIncluded} />
          {hasQuantity && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quantity</span>
              <div className="mt-0.5 text-[12px] text-foreground/80">
                {area.quantity}{area.quantityUnit ? ` ${area.quantityUnit}` : ""}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>Material <strong className="text-foreground">{formatMoney(area.materialCost)}</strong></span>
          <span>Labor <strong className="text-foreground">{formatMoney(area.laborCost)}</strong></span>
          <span>Tax <strong className="text-foreground">{formatMoney(area.tax)}</strong></span>
        </div>
        <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium ${hasImages ? "text-emerald-700 dark:text-emerald-700" : "text-muted-foreground"}`}>
          {hasImages ? <ImageIcon className="size-3.5" /> : <ImageOff className="size-3.5" />}
          {hasImages ? "Images Available" : "No Images"}
        </span>
      </div>
    </div>
  );
}