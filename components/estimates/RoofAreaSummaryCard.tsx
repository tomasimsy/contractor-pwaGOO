"use client";

/**
 * Read-only summary row for one Roof Area on the Estimate Detail page.
 * Shows a table row (No., description, quantity, repair cost) that
 * expands to the area's defect, location, corrective action, materials
 * and cost split. Displays fields already on the RoofingArea model
 * (lib/services/roofingAreaService.ts); adds no new calculations.
 * Photos are read only for an "Images Available"/"No Images" status —
 * thumbnails are intentionally never rendered here (see
 * RoofingAreasEditorV2 / the Edit page for the full photo UI).
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { RoofingArea } from "@/lib/services/roofingAreaService";

/** Column template shared with the table header in EstimateDetail. */
export const ROOF_AREA_ROW_GRID =
  "grid grid-cols-[28px_minmax(0,1fr)_16px] items-center gap-3 sm:grid-cols-[40px_minmax(0,1fr)_96px_110px_16px]";

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

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
          className="mt-0.5 text-[11px] font-medium text-[#0B5F5E] hover:underline"
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
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5B6675]">{label}</span>
      <div className={`mt-0.5 text-[13px] leading-snug ${emphasize ? "font-semibold text-[#1B2430]" : "text-[#1B2430]"}`}>
        <TruncatedText text={value} className={emphasize ? "font-semibold text-[#1B2430]" : ""} />
      </div>
    </div>
  );
}

export function RoofAreaSummaryCard({ area, index, areaSubtotal }: { area: RoofingArea; index: number; areaSubtotal: number }) {
  const [open, setOpen] = useState(false);
  const hasImages = (area.beforePhotos?.length ?? 0) > 0 || (area.afterPhotos?.length ?? 0) > 0;
  const hasDetail = area.defect || area.location || area.correctiveAction || area.materialsIncluded;
  const hasQuantity = !!area.quantity;
  const repairCost = area.estimatedRepairCost || areaSubtotal || area.areaTotal;

  return (
    <div className="border-t border-[#E2E5E0] first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${ROOF_AREA_ROW_GRID} w-full px-3 py-3 text-left hover:bg-[#F8F9F7]`}
      >
        <span className="text-xs font-semibold text-[#8A93A0]">{String(index + 1).padStart(2, "0")}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[#1B2430]">{area.areaName}</span>
          {area.location && <span className="block truncate text-xs text-[#5B6675]">{area.location}</span>}
        </span>
        <span className="hidden text-right text-xs text-[#5B6675] sm:block">
          {hasQuantity ? `${area.quantity}${area.quantityUnit ? ` ${area.quantityUnit}` : ""}` : "—"}
        </span>
        <span className="text-right text-sm font-semibold text-[#1B2430]">{formatMoney(repairCost)}</span>
        <ChevronDown className={`size-4 text-[#5B6675] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-4 pl-[52px] sm:pl-[52px]">
          {area.measurements && <div className="text-xs text-[#5B6675]">Measurements: {area.measurements}</div>}

          {(hasDetail || hasQuantity) && (
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Location" value={area.location} emphasize />
              <Field label="Defect" value={area.defect} />
              <Field label="Corrective action" value={area.correctiveAction} />
              <Field label="Materials included" value={area.materialsIncluded} />
              {hasQuantity && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5B6675]">Quantity</span>
                  <div className="mt-0.5 text-[13px] text-[#1B2430]">
                    {area.quantity}{area.quantityUnit ? ` ${area.quantityUnit}` : ""}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E5E0] pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5B6675]">
              <span>Material <strong className="text-[#1B2430]">{formatMoney(area.materialCost)}</strong></span>
              <span>Labor <strong className="text-[#1B2430]">{formatMoney(area.laborCost)}</strong></span>
              <span>Tax <strong className="text-[#1B2430]">{formatMoney(area.tax)}</strong></span>
            </div>
            <span className={`text-xs font-medium ${hasImages ? "text-[#0B5F5E]" : "text-[#8A93A0]"}`}>
              {hasImages ? "Images available" : "No images"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
