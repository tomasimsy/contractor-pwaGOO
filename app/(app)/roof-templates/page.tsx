"use client";

/**
 * Roof Area Templates — list page. Shows every technician-saved
 * roofing_area_templates row for the company (RoofingAreasEditorV2's
 * "Save as Template" button creates these) plus the built-in
 * EMERGENCY_ROOF_AREA_TEMPLATE preset for reference. Read/delete only —
 * "loading" a template into an area happens from RoofingAreasEditorV2
 * itself, not from here.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { LayoutTemplate, Trash2, FilePlus2 } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { EMERGENCY_ROOF_AREA_TEMPLATE } from "@/lib/estimateQuickTemplates";
import type { RoofingAreaTemplate } from "@/lib/services/roofingAreaTemplateService";

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function RoofTemplatesContent() {
  const { roofingAreaTemplateService } = useServices();
  const { profile } = useAuth();

  const [templates, setTemplates] = useState<RoofingAreaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      setTemplates(await roofingAreaTemplateService.listForCompany(profile.companyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roof area templates.");
    } finally {
      setLoading(false);
    }
  }, [roofingAreaTemplateService, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleDelete = useCallback(
    async (template: RoofingAreaTemplate) => {
      if (!confirm(`Delete the "${template.name}" template? This can't be undone.`)) return;
      setDeletingIds((prev) => new Set([...prev, template.id]));
      try {
        await roofingAreaTemplateService.softDelete(template.id, "Deleted by user");
        setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete template.");
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(template.id);
          return next;
        });
      }
    },
    [roofingAreaTemplateService]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Roof Area Templates"
        description="Reusable roof area presets, saved from the roof estimate editor's “Save as Template” button. Start a new estimate directly from one, or load one into an area you're already editing."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading templates…</div>
      ) : (
        <div className="space-y-3">
          {/* Built-in preset — always available, never deletable. */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-semibold text-foreground">{EMERGENCY_ROOF_AREA_TEMPLATE.label}</h3>
                  <Badge tone="neutral">Built-in</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{EMERGENCY_ROOF_AREA_TEMPLATE.areaName}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold text-foreground">
                  {formatMoney(EMERGENCY_ROOF_AREA_TEMPLATE.laborCost + EMERGENCY_ROOF_AREA_TEMPLATE.materialCost)}
                </span>
                <Link
                  href={`/estimates-roof/new?templateKey=${EMERGENCY_ROOF_AREA_TEMPLATE.key}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                >
                  <FilePlus2 className="size-3.5" /> New Estimate
                </Link>
              </div>
            </div>
          </div>

          {templates.length === 0 ? (
            <EmptyState
              icon={LayoutTemplate}
              title="No saved templates yet"
              description="Save an area's fields as a template from the roof estimate editor to see it here."
            />
          ) : (
            templates.map((t) => (
              <div key={t.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-foreground">{t.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t.areaName}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">
                      {formatMoney(t.laborCost + t.materialCost)}
                    </span>
                    <Link
                      href={`/estimates-roof/new?templateId=${t.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                    >
                      <FilePlus2 className="size-3.5" /> New Estimate
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      disabled={deletingIds.has(t.id)}
                      aria-label="Delete template"
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {(t.defect || t.correctiveAction) && (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {t.defect && <p className="line-clamp-2"><span className="font-medium text-foreground">Defect:</span> {t.defect}</p>}
                    {t.correctiveAction && <p className="line-clamp-2"><span className="font-medium text-foreground">Corrective Action:</span> {t.correctiveAction}</p>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </PageContainer>
  );
}

export default function RoofTemplatesPage() {
  return (
    <RequirePermission resource="estimate" action="view">
      <RoofTemplatesContent />
    </RequirePermission>
  );
}
