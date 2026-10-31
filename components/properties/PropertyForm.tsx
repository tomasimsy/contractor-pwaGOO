"use client";

import { useState } from "react";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Property } from "@/lib/services/propertyService";

const INPUT = "w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

/** Create or edit one property for a client. Shared by the client page's
 * Properties section and the inline "+ New property" in the project form,
 * so both save through the same service call and the same fields. */
export function PropertyForm({
  clientId,
  property,
  onSaved,
  onCancel,
}: {
  clientId: string;
  property?: Property;
  onSaved: (property: Property) => void;
  onCancel: () => void;
}) {
  const { propertyService } = useServices();
  const { profile } = useAuth();

  const [nickname, setNickname] = useState(property?.nickname ?? "");
  const [street, setStreet] = useState(property?.street ?? "");
  const [city, setCity] = useState(property?.city ?? "");
  const [state, setState] = useState(property?.state ?? "");
  const [zip, setZip] = useState(property?.zip ?? "");
  const [notes, setNotes] = useState(property?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.companyId) return;
    if (!street.trim()) {
      setError("Enter the street address.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fields = {
        nickname: nickname.trim() || null,
        street: street.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        zip: zip.trim() || null,
        notes: notes.trim() || null,
      };
      const saved = property
        ? await propertyService.update(property.id, fields)
        : await propertyService.create({ companyId: profile.companyId, clientId, ...fields });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save property.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Nickname</label>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Lake house, Rental on Elm" className={INPUT} />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Street address *</label>
        <input value={street} onChange={(e) => setStreet(e.target.value)} required className={INPUT} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-1">
          <label className="text-xs font-medium text-foreground">City</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} className={INPUT} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">State</label>
          <input value={state} onChange={(e) => setState(e.target.value)} className={INPUT} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">ZIP</label>
          <input value={zip} onChange={(e) => setZip(e.target.value)} className={INPUT} />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={INPUT} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Saving…" : property ? "Save property" : "Add property"}
        </button>
      </div>
    </form>
  );
}
