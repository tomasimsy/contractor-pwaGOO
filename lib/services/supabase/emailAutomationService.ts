import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailAutomationService, AutomationKey, AutomationSettingFields } from "../emailAutomationService";
import type { UUID } from "../types";
import { listEffectiveAutomationSettings, upsertAutomationSetting } from "../../emailAutomationSettings";
import { enforcePermission } from "./enforcePermission";

export function createSupabaseEmailAutomationService(
  supabase: SupabaseClient,
  currentUserId: () => Promise<UUID | null>
): EmailAutomationService {
  async function listEffective(companyId: UUID, profileId?: UUID | null) {
    return listEffectiveAutomationSettings(supabase, companyId, profileId);
  }

  async function upsert(companyId: UUID, profileId: UUID | null, key: AutomationKey, changes: Partial<AutomationSettingFields>) {
    await enforcePermission(supabase, "company_settings", "update");
    const actorId = await currentUserId();
    return upsertAutomationSetting(supabase, companyId, profileId, key, changes, actorId);
  }

  return { listEffective, upsert };
}
