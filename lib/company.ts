// Single source of truth for company branding/content used across the app:
// PDFs, public signing pages, SMS messages, Settings, etc. Every consumer
// should read through this file so a new company never needs code changes.

export type CompanySettings = {
  company_name: string;
  dba: string | null;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_website: string;
  logo_url: string | null;
  tax_id: string;
  license_number: string;
  signature_name: string;
  signature_title: string;
  footer_message: string;
  terms_conditions: string;
  payment_instructions: string;
  warranty_text: string;
  default_deposit_percentage: number;
};

// Used whenever a company hasn't configured a field yet, so documents never
// render blank/broken. Deliberately generic — no specific company's branding.
export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  company_name: "Your Company Name",
  dba: null,
  company_address: "Add your business address in Settings",
  company_phone: "Add your phone number",
  company_email: "Add your email",
  company_website: "",
  logo_url: null,
  tax_id: "",
  license_number: "",
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
};

// Fills in any missing/empty fields with the defaults above.
export function mergeCompanyDefaults(row: Partial<CompanySettings> | null | undefined): CompanySettings {
  return {
    company_name: row?.company_name || DEFAULT_COMPANY_SETTINGS.company_name,
    dba: row?.dba || null,
    company_address: row?.company_address || DEFAULT_COMPANY_SETTINGS.company_address,
    company_phone: row?.company_phone || DEFAULT_COMPANY_SETTINGS.company_phone,
    company_email: row?.company_email || DEFAULT_COMPANY_SETTINGS.company_email,
    company_website: row?.company_website || "",
    logo_url: row?.logo_url || null,
    tax_id: row?.tax_id || "",
    license_number: row?.license_number || "",
    signature_name: row?.signature_name || "",
    signature_title: row?.signature_title || "",
    footer_message: row?.footer_message || DEFAULT_COMPANY_SETTINGS.footer_message,
    terms_conditions: row?.terms_conditions || DEFAULT_COMPANY_SETTINGS.terms_conditions,
    payment_instructions: row?.payment_instructions || DEFAULT_COMPANY_SETTINGS.payment_instructions,
    warranty_text: row?.warranty_text || DEFAULT_COMPANY_SETTINGS.warranty_text,
    default_deposit_percentage: row?.default_deposit_percentage || DEFAULT_COMPANY_SETTINGS.default_deposit_percentage,
  };
}

// Server-side/route helper: loads company_settings for a specific company_id
// (documents belong to a company, so they must not rely on the caller's own
// RLS-scoped "current company" row — an estimate could theoretically be
// rendered by anyone in the same auth context, so always fetch by the
// record's own company_id, never assume "the logged-in user's company").
export async function getCompanySettingsByCompanyId(
  supabase: any,
  companyId: string | null | undefined
): Promise<CompanySettings> {
  if (!companyId) return mergeCompanyDefaults(null);
  const { data } = await supabase
    .from("company_settings")
    .select("*")
    .eq("company_id", companyId)
    .single();
  return mergeCompanyDefaults(data);
}
