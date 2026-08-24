/**
 * Real Supabase-backed CompanyService — a thin wrapper around
 * lib/company.ts's getCompanySettingsByCompanyId/updateCompanySettings,
 * which are ALSO what every PDF route/portal page/public invoice page
 * calls. No second query, no second merge-with-defaults rule.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyService } from "../companyService";
import type { UUID } from "../types";
import { getCompanySettingsByCompanyId, updateCompanySettings, type CompanySettings } from "../../company";

export function createSupabaseCompanyService(
  supabase: SupabaseClient,
  currentUserId: () => Promise<UUID | null>
): CompanyService {
  async function getByCompanyId(companyId: UUID, profileId?: UUID | null): Promise<CompanySettings> {
    return getCompanySettingsByCompanyId(supabase, companyId, profileId);
  }

  async function update(companyId: UUID, changes: Partial<CompanySettings>): Promise<CompanySettings> {
    const actorId = await currentUserId();
    return updateCompanySettings(supabase, companyId, changes, actorId);
  }

  return { getByCompanyId, update };
}
