/**
 * Storage layer for `email_automations` — mirrors lib/company.ts's
 * shape (a plain read/write module, not a Layer 2 service) so it can
 * be called directly by both the browser-facing EmailAutomationService
 * (Task 4) and the server-only cron route (Task 7) with a service-role
 * client, the same split lib/company.ts already has for
 * getCompanySettingsByCompanyId.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUTOMATION_META,
  getAutomationMeta,
  type AutomationKey,
  type AutomationSettingFields,
  type DelayUnit,
} from "./services/emailAutomationRegistry";

export interface StoredAutomationRow extends AutomationSettingFields {
  key: AutomationKey;
  profileId: string | null;
}

function registryDefault(key: AutomationKey): AutomationSettingFields {
  const meta = getAutomationMeta(key);
  return {
    enabled: meta.defaultEnabled,
    delayValue: meta.defaultDelay.value,
    delayUnit: meta.defaultDelay.unit,
    condition: null,
    subjectTemplate: null,
    bodyTemplate: null,
  };
}

/** Pure — profile row (exact match) -> company-default row
 * (profileId null) -> registry default, in that order. Rows for a
 * different automation key are ignored (defensive: callers are
 * expected to have already scoped `rows` to one key, but a caller
 * that passes the full unfiltered set must never leak another
 * automation's settings in). */
export function resolveEffectiveSettings(
  key: AutomationKey,
  rows: StoredAutomationRow[],
  profileId: string | null | undefined
): AutomationSettingFields {
  const scoped = rows.filter((r) => r.key === key);
  if (profileId) {
    const profileRow = scoped.find((r) => r.profileId === profileId);
    if (profileRow) return profileRow;
  }
  const companyRow = scoped.find((r) => r.profileId === null);
  if (companyRow) return companyRow;
  return registryDefault(key);
}

function rowToStored(row: Record<string, unknown>): StoredAutomationRow {
  return {
    key: row.automation_key as AutomationKey,
    profileId: (row.profile_id as string | null) ?? null,
    enabled: row.enabled as boolean,
    delayValue: row.delay_value as number,
    delayUnit: row.delay_unit as DelayUnit,
    condition: (row.condition as Record<string, unknown> | null) ?? null,
    subjectTemplate: (row.subject_template as string | null) ?? null,
    bodyTemplate: (row.body_template as string | null) ?? null,
  };
}

export async function getEffectiveAutomationSettings(
  supabase: SupabaseClient,
  companyId: string,
  key: AutomationKey,
  profileId?: string | null
): Promise<AutomationSettingFields> {
  const { data, error } = await supabase
    .from("email_automations")
    .select("*")
    .eq("company_id", companyId)
    .eq("automation_key", key);
  if (error) throw new Error(`Failed to load automation settings: ${error.message}`);
  return resolveEffectiveSettings(key, (data ?? []).map(rowToStored), profileId);
}

export async function listEffectiveAutomationSettings(
  supabase: SupabaseClient,
  companyId: string,
  profileId?: string | null
): Promise<(AutomationSettingFields & { key: AutomationKey })[]> {
  const { data, error } = await supabase.from("email_automations").select("*").eq("company_id", companyId);
  if (error) throw new Error(`Failed to load automation settings: ${error.message}`);
  const rows = (data ?? []).map(rowToStored);
  return AUTOMATION_META.map((meta) => ({ key: meta.key, ...resolveEffectiveSettings(meta.key, rows, profileId) }));
}

export async function upsertAutomationSetting(
  supabase: SupabaseClient,
  companyId: string,
  profileId: string | null,
  key: AutomationKey,
  changes: Partial<AutomationSettingFields>,
  updatedBy: string | null
): Promise<AutomationSettingFields> {
  const existingQuery = supabase
    .from("email_automations")
    .select("id, enabled, delay_value, delay_unit, condition, subject_template, body_template")
    .eq("company_id", companyId)
    .eq("automation_key", key);
  const { data: existing } =
    profileId === null
      ? await existingQuery.is("profile_id", null).maybeSingle()
      : await existingQuery.eq("profile_id", profileId).maybeSingle();

  const base = existing
    ? {
        enabled: existing.enabled,
        delayValue: existing.delay_value,
        delayUnit: existing.delay_unit,
        condition: existing.condition,
        subjectTemplate: existing.subject_template,
        bodyTemplate: existing.body_template,
      }
    : registryDefault(key);
  const merged = { ...base, ...changes };

  const payload = {
    company_id: companyId,
    profile_id: profileId,
    automation_key: key,
    enabled: merged.enabled,
    delay_value: merged.delayValue,
    delay_unit: merged.delayUnit,
    condition: merged.condition,
    subject_template: merged.subjectTemplate,
    body_template: merged.bodyTemplate,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase.from("email_automations").update(payload).eq("id", existing.id);
    if (error) throw new Error(`Failed to save automation settings: ${error.message}`);
  } else {
    const { error } = await supabase.from("email_automations").insert({ ...payload, created_by: updatedBy });
    if (error) throw new Error(`Failed to save automation settings: ${error.message}`);
  }
  return merged;
}
