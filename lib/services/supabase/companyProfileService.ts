/**
 * Supabase-backed CompanyProfileService — implements the interface
 * from lib/services/companyProfileService.ts against the
 * `company_profiles` table. Mirrors CompanyDocumentService's shape
 * (same soft-delete/reason/restore contract via ValidationService.
 * validateDeleteReason).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyProfile, CompanyProfileService } from "../companyProfileService";
import type { UUID } from "../types";
import type { ValidationService } from "../validationService";
import { validatePortalDomain } from "../../portalDomainValidation";
import { enforcePermission } from "./enforcePermission";

interface CompanyProfileRow {
  id: string;
  company_id: string;
  company_name: string;
  logo_url: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_website: string | null;
  company_address: string | null;
  footer_message: string | null;
  portal_domain: string | null;
  email_message_template: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

function rowToProfile(row: CompanyProfileRow): CompanyProfile {
  return {
    id: row.id as UUID,
    companyId: row.company_id as UUID,
    companyName: row.company_name,
    logoUrl: row.logo_url,
    companyPhone: row.company_phone,
    companyEmail: row.company_email,
    companyWebsite: row.company_website,
    companyAddress: row.company_address,
    footerMessage: row.footer_message,
    portalDomain: row.portal_domain,
    emailMessageTemplate: row.email_message_template,
    createdBy: row.created_by as UUID | null,
    createdAt: row.created_at,
    updatedBy: row.updated_by as UUID | null,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by as UUID | null,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

export function createSupabaseCompanyProfileService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  currentUserId: () => Promise<UUID | null>
): CompanyProfileService {
  async function listForCompany(companyId: UUID, includeDeleted = false): Promise<CompanyProfile[]> {
    let query = supabase.from("company_profiles").select("*").eq("company_id", companyId);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(`Failed to list business profiles: ${error.message}`);
    return (data as CompanyProfileRow[]).map(rowToProfile);
  }

  async function create(input: {
    companyId: UUID;
    companyName: string;
    logoUrl?: string | null;
    companyPhone?: string | null;
    companyEmail?: string | null;
    companyWebsite?: string | null;
    companyAddress?: string | null;
    footerMessage?: string | null;
    portalDomain?: string | null;
    emailMessageTemplate?: string | null;
  }): Promise<CompanyProfile> {
    // Business Profiles aren't their own Resource in PERMISSION_MATRIX
    // (permissions.ts) — treated as company_settings, same
    // admin/office-only boundary as the rest of company branding.
    await enforcePermission(supabase, "company_settings", "create");
    if (!input.companyName.trim()) throw new Error("A business name is required.");
    const domainCheck = validatePortalDomain(input.portalDomain ?? "");
    if (!domainCheck.valid) throw new Error(domainCheck.message ?? "Invalid portal domain.");

    // Case-insensitive duplicate guard, scoped to this company only —
    // nothing stopped a company from ending up with several near-
    // identical active profiles (e.g. multiple "One Square Roofing
    // LLC" rows) before this. `ilike` with escaped wildcards case-
    // folds without turning into a fuzzy/substring match.
    const escapedName = input.companyName.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("company_profiles")
      .select("id")
      .eq("company_id", input.companyId)
      .is("deleted_at", null)
      .ilike("company_name", escapedName)
      .limit(1)
      .maybeSingle();
    if (existingProfileError) throw new Error(`Failed to check for an existing business profile: ${existingProfileError.message}`);
    if (existingProfile) throw new Error("A business profile with this name already exists.");

    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("company_profiles")
      .insert({
        company_id: input.companyId,
        company_name: input.companyName.trim(),
        logo_url: input.logoUrl ?? null,
        company_phone: input.companyPhone ?? null,
        company_email: input.companyEmail ?? null,
        company_website: input.companyWebsite ?? null,
        company_address: input.companyAddress ?? null,
        footer_message: input.footerMessage ?? null,
        portal_domain: domainCheck.normalized ?? null,
        email_message_template: input.emailMessageTemplate?.trim() || null,
        created_by: actorId,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to save business profile: ${error.message}`);
    return rowToProfile(data as CompanyProfileRow);
  }

  async function update(
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
  ): Promise<CompanyProfile> {
    await enforcePermission(supabase, "company_settings", "update");
    if (changes.companyName !== undefined && !changes.companyName.trim()) {
      throw new Error("A business name is required.");
    }
    // Same duplicate guard as create() — renaming a profile into a
    // name that collides with another active profile on the SAME
    // company is blocked the same way creating a fresh duplicate is.
    if (changes.companyName !== undefined) {
      const { data: currentRow, error: currentRowError } = await supabase
        .from("company_profiles")
        .select("company_id")
        .eq("id", profileId)
        .single();
      if (currentRowError) throw new Error(`Failed to load this business profile: ${currentRowError.message}`);
      const escapedName = changes.companyName.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("company_profiles")
        .select("id")
        .eq("company_id", currentRow.company_id)
        .is("deleted_at", null)
        .neq("id", profileId)
        .ilike("company_name", escapedName)
        .limit(1)
        .maybeSingle();
      if (existingProfileError) throw new Error(`Failed to check for an existing business profile: ${existingProfileError.message}`);
      if (existingProfile) throw new Error("A business profile with this name already exists.");
    }
    let normalizedPortalDomain: string | null | undefined;
    if (changes.portalDomain !== undefined) {
      const domainCheck = validatePortalDomain(changes.portalDomain ?? "");
      if (!domainCheck.valid) throw new Error(domainCheck.message ?? "Invalid portal domain.");
      normalizedPortalDomain = domainCheck.normalized ?? null;
    }
    const actorId = await currentUserId();
    const payload: Record<string, unknown> = { updated_by: actorId, updated_at: new Date().toISOString() };
    if (changes.companyName !== undefined) payload.company_name = changes.companyName.trim();
    if (changes.logoUrl !== undefined) payload.logo_url = changes.logoUrl;
    if (changes.companyPhone !== undefined) payload.company_phone = changes.companyPhone;
    if (changes.companyEmail !== undefined) payload.company_email = changes.companyEmail;
    if (changes.companyWebsite !== undefined) payload.company_website = changes.companyWebsite;
    if (changes.companyAddress !== undefined) payload.company_address = changes.companyAddress;
    if (changes.footerMessage !== undefined) payload.footer_message = changes.footerMessage;
    if (normalizedPortalDomain !== undefined) payload.portal_domain = normalizedPortalDomain;
    if (changes.emailMessageTemplate !== undefined) payload.email_message_template = changes.emailMessageTemplate?.trim() || null;

    const { data, error } = await supabase.from("company_profiles").update(payload).eq("id", profileId).select().single();
    if (error) throw new Error(`Failed to update business profile: ${error.message}`);
    return rowToProfile(data as CompanyProfileRow);
  }

  async function softDelete(profileId: UUID, reason: string): Promise<void> {
    await enforcePermission(supabase, "company_settings", "delete");
    const check = validationService.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues[0]?.message ?? "A delete reason is required.");
    const actorId = await currentUserId();
    const { error } = await supabase
      .from("company_profiles")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", profileId);
    if (error) throw new Error(`Failed to delete business profile: ${error.message}`);
  }

  async function restore(profileId: UUID): Promise<void> {
    await enforcePermission(supabase, "company_settings", "update");
    const { error } = await supabase
      .from("company_profiles")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .eq("id", profileId);
    if (error) throw new Error(`Failed to restore business profile: ${error.message}`);
  }

  return { listForCompany, create, update, softDelete, restore };
}
