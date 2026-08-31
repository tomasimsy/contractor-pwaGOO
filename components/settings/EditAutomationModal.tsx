"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { AutomationKey, AutomationSettingFields } from "@/lib/services/emailAutomationService";
import { getAutomationMeta } from "@/lib/services/emailAutomationRegistry";

export function EditAutomationModal({
  automationKey,
  initial,
  onClose,
  onSave,
}: {
  automationKey: AutomationKey;
  initial: AutomationSettingFields;
  onClose: () => void;
  onSave: (changes: Partial<AutomationSettingFields>) => Promise<void>;
}) {
  const meta = getAutomationMeta(automationKey);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [delayValue, setDelayValue] = useState(initial.delayValue);
  const [delayUnit, setDelayUnit] = useState<"hours" | "days">(initial.delayUnit);
  const [onlyIfPaidInFull, setOnlyIfPaidInFull] = useState(
    Boolean(initial.condition?.onlyIfPaidInFull ?? true)
  );
  const [subjectTemplate, setSubjectTemplate] = useState(initial.subjectTemplate ?? "");
  const [bodyTemplate, setBodyTemplate] = useState(initial.bodyTemplate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        enabled,
        delayValue,
        delayUnit,
        condition: meta.supportsCondition ? { onlyIfPaidInFull } : null,
        subjectTemplate: subjectTemplate.trim() || null,
        bodyTemplate: bodyTemplate.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this automation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={meta.label}>
      <div className="space-y-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable automation
        </label>

        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">When</label>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>

        {/* payment_receipt is event-triggered at the moment a payment is
            recorded and no code path defers it, so a configured delay
            would be silently ignored — show the fixed behavior instead
            of an editable control nothing reads. */}
        {automationKey === "payment_receipt" ? (
          <p className="text-xs text-muted-foreground">Sent immediately when a payment is recorded.</p>
        ) : (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-foreground">Wait</label>
          <input
            type="number"
            min={0}
            value={delayValue}
            onChange={(e) => setDelayValue(Math.max(0, Number(e.target.value) || 0))}
            className="h-9 w-20 rounded-lg border border-input bg-background px-2 text-sm"
          />
          <select
            value={delayUnit}
            onChange={(e) => setDelayUnit(e.target.value as "hours" | "days")}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          >
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
          <span className="text-xs text-muted-foreground">
            {meta.delayDirection === "before" ? "before the trigger" : "after the trigger"}
          </span>
        </div>
        )}

        {meta.supportsCondition && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={onlyIfPaidInFull} onChange={(e) => setOnlyIfPaidInFull(e.target.checked)} />
            Send only when invoice is paid in full
          </label>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Email subject</label>
          <input
            type="text"
            value={subjectTemplate}
            onChange={(e) => setSubjectTemplate(e.target.value)}
            placeholder="Leave blank for the default subject"
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Email body</label>
          <textarea
            value={bodyTemplate}
            onChange={(e) => setBodyTemplate(e.target.value)}
            rows={5}
            placeholder="Leave blank for the default message. Supports {clientName}, {companyName}."
            className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm"
          />
        </div>

        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
