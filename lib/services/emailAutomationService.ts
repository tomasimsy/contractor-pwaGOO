/**
 * Layer 2 — the authenticated Settings page's read/write path for
 * `email_automations`. Thin wrapper over lib/emailAutomationSettings.ts,
 * same split lib/services/companyService.ts has over lib/company.ts:
 * this file owns nothing but permission enforcement + the actor id;
 * all business meaning (what each automation does, its defaults) lives
 * in lib/services/emailAutomationRegistry.ts.
 */
import type { UUID } from "./types";
import type { AutomationKey, AutomationSettingFields } from "./emailAutomationRegistry";

export type { AutomationKey, AutomationSettingFields };

export interface EmailAutomationService {
  /** All 11 automations for this company, resolved against
   * `profileId` (null = the company-default view) — one entry per
   * AUTOMATION_META item, in that order. */
  listEffective(companyId: UUID, profileId?: UUID | null): Promise<(AutomationSettingFields & { key: AutomationKey })[]>;
  /** Upserts the given fields for one automation, scoped to
   * `profileId` (null = editing the company default). */
  upsert(
    companyId: UUID,
    profileId: UUID | null,
    key: AutomationKey,
    changes: Partial<AutomationSettingFields>
  ): Promise<AutomationSettingFields>;
}
