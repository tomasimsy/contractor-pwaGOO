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
  // Still need the CURRENT values to correctly merge a PARTIAL
  // `changes` (e.g. just `{enabled: false}` from the row toggle) on
  // top of them — an upsert has to write every column, so a partial
  // change can't just be sent alone. This read is fine to be
  // non-atomic with the write below; it's a merge-base lookup, not
  // the thing that used to race.
  const existingQuery = supabase
    .from("email_automations")
    .select("enabled, delay_value, delay_unit, condition, subject_template, body_template")
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

  // A single atomic upsert, not the old "check if it exists, then
  // insert or update" — that had a real TOCTOU race: two
  // near-simultaneous saves for the same (companyId, profileId, key)
  // (e.g. a double-clicked toggle, or a toggle click landing while an
  // Edit-modal save is still in flight) could both see "no row exists"
  // and both attempt an insert, and the second one hit the unique
  // constraint and threw. `onConflict` targets the exact column set
  // each case is actually protected by: the plain 3-column unique
  // constraint for a real profile_id, or the profile_id-IS-NULL
  // partial unique index (20260908000000 migration) for the company
  // default — Postgres's plain unique constraint alone does NOT
  // de-duplicate NULL profile_id rows, which is why that partial
  // index exists.
  //
  // Trade-off: the JS client's upsert() rewrites every column on
  // conflict, so `created_by` gets reset to the current editor on
  // every save, not just the row's original creator — acceptable for
  // a low-stakes settings audit field, not worth a raw-SQL RPC to
  // preserve.
  const { error } = await supabase.from("email_automations").upsert(
    { ...payload, created_by: updatedBy },
    { onConflict: profileId === null ? "company_id,automation_key" : "company_id,profile_id,automation_key" }
  );
  if (error) throw new Error(`Failed to save automation settings: ${error.message}`);
  return merged;
}
