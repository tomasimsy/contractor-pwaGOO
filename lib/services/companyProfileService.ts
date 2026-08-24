/**
 * Layer 2 — owns `company_profiles`: customer-facing brand identities
 * a company can present as on an estimate/invoice (e.g. "One Square
 * Roofing" vs "OSRPros"), without duplicating the company, financial
 * data, or any calculation. See supabase/migrations/
 * 20260821010000_company_profiles.sql's header for the full model.
 *
 * Read access for a SPECIFIC document's chosen profile (customer-
 * facing PDF/email/portal) goes through lib/company.ts's
 * getCompanyProfileById/getCompanySettingsByCompanyId, NOT this
 * service — this service is the staff-side management surface
 * (list/create/update/soft-delete), same split EstimatePhotoService
 * has from the PDF's own photo-reading code.
 */
import type { UUID, AuditedEntity } from "./types";

export interface CompanyProfile extends AuditedEntity {
  companyName: string;
  logoUrl: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyAddress: string | null;
  footerMessage: string | null;
  /** This profile's customer-facing base URL (e.g.
   * "https://osrpros.com") for portal/estimate links — see
   * lib/portalDomain.ts's resolvePortalOrigin, the only reader.
   * Validated on write (lib/portalDomainValidation.ts): HTTPS,
   * origin-only, no local/private hostname. Null = use the app's
   * fixed default origin. */
  portalDomain: string | null;
  /** This profile's own "Email Customer" default message body — see
   * lib/email/sendEstimateEmail.ts's buildDefaultEstimateMessage, the
   * fallback used when this is null. Supports `{clientName}` and
   * `{companyName}` placeholders, substituted when a send is composed. */
  emailMessageTemplate: string | null;
}

export interface CompanyProfileService {
  listForCompany(companyId: UUID, includeDeleted?: boolean): Promise<CompanyProfile[]>;

  create(input: {
    companyId: UUID;
    companyName: string;
    logoUrl?: string | null;
    companyPhone?: string | null;
    companyEmail?: string | null;
    companyWebsite?: string | null;
    companyAddress?: string | null;
    footerMessage?: string | null;
    /** Raw user input — validated/normalized by the implementation
     * via lib/portalDomainValidation.ts before it's ever written. */
    portalDomain?: string | null;
    emailMessageTemplate?: string | null;
  }): Promise<CompanyProfile>;

  update(
    profileId: UUID,
    changes: Partial<{
      companyName: string;
      logoUrl: string | null;
      companyPhone: string | null;
      companyEmail: string | null;
      companyWebsite: string | null;
      companyAddress: string | null;
      footerMessage: string | null;
      portalDomain: string | null;
      emailMessageTemplate: string | null;
    }>
  ): Promise<CompanyProfile>;

  /** Hard-ish guard, not a financial safeguard: a profile still
   * referenced by any estimate/invoice (profile_id FK) would leave
   * those documents pointing at a deleted profile — a nullable FK
   * with `on delete set null` already prevents that from ever being a
   * DB error, but a caller UI should still warn before removing a
   * profile in active use. Soft delete, same reason/restore contract
   * as every other soft-deletable entity in this app. */
  softDelete(profileId: UUID, reason: string): Promise<void>;
  restore(profileId: UUID): Promise<void>;
}
