"use client";

import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { AUTOMATION_META } from "@/lib/services/emailAutomationRegistry";
import type { AutomationKey, AutomationSettingFields } from "@/lib/services/emailAutomationService";
import type { CompanyProfile } from "@/lib/services/companyProfileService";
import { EmailAutomationRow } from "@/components/settings/EmailAutomationRow";
import { EditAutomationModal } from "@/components/settings/EditAutomationModal";

function EmailAutomationsContent() {
  const { emailAutomationService, companyProfileService } = useServices();
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<AutomationKey, AutomationSettingFields> | null>(null);
  const [editingKey, setEditingKey] = useState<AutomationKey | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    const [profileList, effective] = await Promise.all([
      companyProfileService.listForCompany(profile.companyId),
      emailAutomationService.listEffective(profile.companyId, selectedProfileId),
    ]);
    setProfiles(profileList);
    setSettings(
      Object.fromEntries(effective.map((e) => [e.key, e])) as unknown as Record<AutomationKey, AutomationSettingFields>
    );
    setLoading(false);
  }, [companyProfileService, emailAutomationService, profile?.companyId, selectedProfileId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(key: AutomationKey, enabled: boolean) {
    if (!profile?.companyId) return;
    await emailAutomationService.upsert(profile.companyId, selectedProfileId, key, { enabled });
    await load();
  }

  async function handleSave(key: AutomationKey, changes: Partial<AutomationSettingFields>) {
    if (!profile?.companyId) return;
    await emailAutomationService.upsert(profile.companyId, selectedProfileId, key, changes);
    await load();
  }

  return (
    <PageContainer>
      <PageHeader
        title="Email Automations"
        description="Automatically send customer emails based on estimates, invoices, payments, and completed jobs."
      />

      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-foreground">Editing settings for</label>
        <select
          value={selectedProfileId ?? ""}
          onChange={(e) => setSelectedProfileId(e.target.value || null)}
          className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
        >
          <option value="">Company Default</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.companyName}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Per-profile overrides currently apply to Payment Receipt only — other automations use the company default
          regardless of which profile is selected here.
        </p>
      </div>

      {loading || !settings ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-2">
          {AUTOMATION_META.map((meta) => (
            <EmailAutomationRow
              key={meta.key}
              automationKey={meta.key}
              settings={settings[meta.key]}
              onToggle={(enabled) => handleToggle(meta.key, enabled)}
              onEdit={() => setEditingKey(meta.key)}
            />
          ))}
        </div>
      )}

      {editingKey && settings && (
        <EditAutomationModal
          automationKey={editingKey}
          initial={settings[editingKey]}
          onClose={() => setEditingKey(null)}
          onSave={(changes) => handleSave(editingKey, changes)}
        />
      )}
    </PageContainer>
  );
}

export default function EmailAutomationsPage() {
  return (
    <RequirePermission resource="company_settings" action="update">
      <EmailAutomationsContent />
    </RequirePermission>
  );
}
