"use client";

import { Pencil } from "lucide-react";
import type { AutomationKey, AutomationSettingFields } from "@/lib/services/emailAutomationService";
import { getAutomationMeta } from "@/lib/services/emailAutomationRegistry";

function timingLabel(delayValue: number, delayUnit: string, direction: "after" | "before"): string {
  if (delayValue === 0) return "Immediately";
  const unit = delayValue === 1 ? delayUnit.replace(/s$/, "") : delayUnit;
  return direction === "before" ? `${delayValue} ${unit} before` : `${delayValue} ${unit} after`;
}

export function EmailAutomationRow({
  automationKey,
  settings,
  onToggle,
  onEdit,
}: {
  automationKey: AutomationKey;
  settings: AutomationSettingFields;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
}) {
  const meta = getAutomationMeta(automationKey);
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{meta.label}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              settings.enabled ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
            }`}
          >
            {settings.enabled ? "On" : "Off"}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {timingLabel(settings.delayValue, settings.delayUnit, meta.delayDirection)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="peer sr-only"
          />
          <div className="h-5 w-9 rounded-full bg-muted transition-colors peer-checked:bg-primary" />
          <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
        </label>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-2.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <Pencil className="size-3.5" /> Edit
        </button>
      </div>
    </div>
  );
}
