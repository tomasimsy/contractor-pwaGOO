// Single source of truth for company branding/content used across the app:
// PDFs, public signing pages, SMS messages, Settings, etc. Every consumer
// should read through this file so a new company never needs code changes.
import type { SupabaseClient } from "@supabase/supabase-js";

export type CompanySettings = {
  company_name: string;
  dba: string | null;
  business_type: string | null;
  company_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  company_phone: string;
  company_email: string;
  company_website: string;
  logo_url: string | null;
  tax_id: string;
  license_number: string;
  insurance_policy: string | null;
  brand_color: string | null;
  notes: string | null;
  signature_name: string;
  signature_title: string;
  footer_message: string;
  terms_conditions: string;
  payment_instructions: string;
  warranty_text: string;
  default_deposit_percentage: number;
  /** Per-company overrides of the three built-in Terms & Conditions
   * templates (lib/estimateTerms.ts is the single source of the
   * DEFAULT text for each). Null/empty means "use the built-in
   * default" — same convention as terms_conditions/warranty_text
   * above. Read through getEstimateTermsTemplate(), never directly. */
  terms_roofing: string | null;
  terms_custom: string | null;
  terms_home_remodel: string | null;
};

// Used whenever a company hasn't configured a field yet, so documents never
// render blank/broken. Deliberately generic — no specific company's branding.
export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  company_name: "Your Company Name",
  dba: null,
  business_type: null,
  company_address: "Add your business address in Settings",
  city: null,
  state: null,
  zip: null,
  country: null,
  company_phone: "Add your phone number",
  company_email: "Add your email",
  company_website: "",
  logo_url: null,
  tax_id: "",
  license_number: "",
  insurance_policy: null,
  brand_color: null,
  notes: null,
  signature_name: "",
  signature_title: "",
  footer_message: "Thank you for your business!",
  terms_conditions: [
    "Valid for 30 days from date issued",
    "50% deposit required to begin, balance due upon completion",
    "Changes must be approved in writing (additional charges may apply)",
    "Client must provide safe access to work areas",
    "Client responsible for marking underground lines, irrigation, drain lines, low-voltage wires, and hidden utilities",
    "Contractor not liable for damage from unmarked underground items",
    "NC residential jobs: cancellation rights per state and federal law",
    "Schedule may be affected by weather, material delays, or hidden conditions",
    "Debris cleanup limited to approved scope of work",
  ].join("\n"),
  payment_instructions:
    "A deposit is required to begin work. Remaining balance is due upon completion.",
  warranty_text:
    "Warranty excludes: weather, tree roots, drainage, soil movement, customer neglect, or third-party work.",
  default_deposit_percentage: 50,
  terms_roofing: null,
  terms_custom: null,
  terms_home_remodel: null,
};

// Fills in any missing/empty fields with the defaults above.
export function mergeCompanyDefaults(row: Partial<CompanySettings> | null | undefined): CompanySettings {
  return {
    company_name: row?.company_name || DEFAULT_COMPANY_SETTINGS.company_name,
    dba: row?.dba || null,
    business_type: row?.business_type || null,
    company_address: row?.company_address || DEFAULT_COMPANY_SETTINGS.company_address,
    city: row?.city || null,
    state: row?.state || null,
    zip: row?.zip || null,
    country: row?.country || null,
    company_phone: row?.company_phone || DEFAULT_COMPANY_SETTINGS.company_phone,
    company_email: row?.company_email || DEFAULT_COMPANY_SETTINGS.company_email,
    company_website: row?.company_website || "",
    logo_url: row?.logo_url || null,
    tax_id: row?.tax_id || "",
    license_number: row?.license_number || "",
    insurance_policy: row?.insurance_policy || null,
    brand_color: row?.brand_color || null,
    notes: row?.notes || null,
    signature_name: row?.signature_name || "",
    signature_title: row?.signature_title || "",
    footer_message: row?.footer_message || DEFAULT_COMPANY_SETTINGS.footer_message,
    terms_conditions: row?.terms_conditions || DEFAULT_COMPANY_SETTINGS.terms_conditions,
    payment_instructions: row?.payment_instructions || DEFAULT_COMPANY_SETTINGS.payment_instructions,
    warranty_text: row?.warranty_text || DEFAULT_COMPANY_SETTINGS.warranty_text,
    default_deposit_percentage: row?.default_deposit_percentage || DEFAULT_COMPANY_SETTINGS.default_deposit_percentage,
    terms_roofing: row?.terms_roofing || null,
    terms_custom: row?.terms_custom || null,
    terms_home_remodel: row?.terms_home_remodel || null,
  };
}

// Server-side/route helper: loads company_settings for a specific company_id
// (documents belong to a company, so they must not rely on the caller's own
// RLS-scoped "current company" row — an estimate could theoretically be
// rendered by anyone in the same auth context, so always fetch by the
// record's own company_id, never assume "the logged-in user's company").
//
// `companies.name` — NOT `company_settings.company_name` — is the
// authoritative company name. `companies` is the identity table every
// other row in the schema keys off (`profiles.company_id`, etc.) and is
// what signup (app/api/auth/signup/route.ts) actually writes; a second,
// independently-editable `company_name` column on `company_settings` used
// to silently disagree with it the moment a company signed up without
// ever visiting Settings — found live: Settings showed the placeholder
// "Your Company Name" for a company that had already signed up under a
// real name. Reading BOTH tables here and letting `companies.name` win is
// what makes Settings/PDFs/invoices/portal (every one of them already
// calls this same function) agree with what the user actually typed at
// signup, without merging the two tables or duplicating this query.
export async function getCompanySettingsByCompanyId(
  supabase: SupabaseClient,
  companyId: string | null | undefined
): Promise<CompanySettings> {
  if (!companyId) return mergeCompanyDefaults(null);
  const [{ data: settingsRow }, { data: companyRow }] = await Promise.all([
    supabase.from("company_settings").select("*").eq("company_id", companyId).single(),
    supabase.from("companies").select("name").eq("id", companyId).single(),
  ]);
  return mergeCompanyDefaults({
    ...(settingsRow as Partial<CompanySettings> | null),
    company_name: companyRow?.name || (settingsRow as { company_name?: string } | null)?.company_name,
  });
}

/** Writes company_settings — the ONE write path for company branding/
 * content data, mirrored by CompanyService.update (lib/services/
 * supabase/companyService.ts) so the Settings page and any future
 * server-side writer never duplicate this logic. A company may not
 * have a company_settings row yet (the table is populated on first
 * save, not at company creation), so this checks for an existing row
 * itself and updates or inserts accordingly — deliberately NOT
 * `.upsert(..., { onConflict: "company_id" })`, which requires a
 * unique/exclusion constraint on `company_id` that the live table does
 * not have (confirmed live: "there is no unique or exclusion
 * constraint matching the ON CONFLICT specification"). Two round
 * trips instead of one, but no schema change required. */
export async function updateCompanySettings(
  supabase: SupabaseClient,
  companyId: string,
  changes: Partial<CompanySettings>,
  updatedBy: string | null
): Promise<CompanySettings> {
  // Keep `companies.name` (the authoritative name — see
  // getCompanySettingsByCompanyId's comment) in sync whenever the name
  // is edited here, so Settings and every other consumer never drift
  // apart again after this save.
  if (changes.company_name && changes.company_name.trim()) {
    const { error: companyError } = await supabase
      .from("companies")
      .update({ name: changes.company_name.trim() })
      .eq("id", companyId);
    if (companyError) throw new Error(`Failed to save company name: ${companyError.message}`);
  }

  const { data: existing, error: lookupError } = await supabase
    .from("company_settings")
    .select("id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (lookupError) throw new Error(`Failed to save company settings: ${lookupError.message}`);

  const payload = { ...changes, updated_by: updatedBy, updated_at: new Date().toISOString() };

  if (existing) {
    const { data, error } = await supabase
      .from("company_settings")
      .update(payload)
      .eq("company_id", companyId)
      .select()
      .single();
    if (error) throw new Error(`Failed to save company settings: ${error.message}`);
    return mergeCompanyDefaults(data);
  }

  const { data, error } = await supabase
    .from("company_settings")
    .insert({ company_id: companyId, ...payload })
    .select()
    .single();
  if (error) throw new Error(`Failed to save company settings: ${error.message}`);
  return mergeCompanyDefaults(data);
}
