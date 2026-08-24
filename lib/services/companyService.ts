/**
 * Layer 2 — owns `company_settings`, the SAME table every PDF route
 * (app/api/invoices/[id]/pdf, app/api/estimates/[id]/pdf), the public
 * portal page (app/portal/[id]), and the public invoice page
 * (app/invoice/[id]) already read via lib/company.ts's
 * getCompanySettingsByCompanyId/mergeCompanyDefaults. This service is
 * the read/write path the authenticated Settings page uses — it
 * reuses those exact functions rather than re-querying the table, so
 * there is exactly one place that knows the company_settings schema
 * and exactly one merge-with-defaults rule everywhere in the app.
 */
import type { UUID } from "./types";
import type { CompanySettings } from "../company";

export type { CompanySettings };

export interface CompanyService {
  /** Loads this company's settings, filled in with
   * DEFAULT_COMPANY_SETTINGS for anything not yet configured — the
   * exact same merge every PDF/portal/public page already relies on.
   * `profileId` overlays a Business Profile's fields on top (name/
   * logo/phone/email/website/address/footer) — pass an estimate/
   * invoice's own `profileId` so a caller (e.g. the "Email Customer"
   * modal) can show/use the SAME resolved identity the PDF/email send
   * will actually use, not just the company's bare default. */
  getByCompanyId(companyId: UUID, profileId?: UUID | null): Promise<CompanySettings>;

  /** Upserts the given fields — a company with no company_settings row
   * yet gets one created on first save. */
  update(companyId: UUID, changes: Partial<CompanySettings>): Promise<CompanySettings>;
}
