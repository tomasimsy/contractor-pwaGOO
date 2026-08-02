/**
 * Supabase-backed CompanyDocumentService — implements the interface
 * from lib/services/companyDocumentService.ts against the
 * `company_documents` table. Reuses ValidationService.validateDeleteReason,
 * the same required-reason rule every other soft-delete in this app
 * enforces (see EstimateService.softDelete's doc comment).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CompanyDocument,
  CompanyDocumentCategory,
  CompanyDocumentService,
} from "../companyDocumentService";
import type { UUID } from "../types";
import type { ValidationService } from "../validationService";

interface CompanyDocumentRow {
  id: string;
  company_id: string;
  category: string;
  name: string;
  storage_path: string;
  file_type: string;
  file_size: number;
  expiration_date: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

function rowToDocument(row: CompanyDocumentRow): CompanyDocument {
  return {
    id: row.id as UUID,
    companyId: row.company_id as UUID,
    category: row.category as CompanyDocumentCategory,
    name: row.name,
    storagePath: row.storage_path,
    fileType: row.file_type,
    fileSize: row.file_size,
    expirationDate: row.expiration_date,
    uploadedBy: row.uploaded_by as UUID | null,
    createdBy: row.uploaded_by as UUID | null,
    createdAt: row.created_at,
    updatedBy: null,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by as UUID | null,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

export function createSupabaseCompanyDocumentService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  currentUserId: () => Promise<UUID | null>
): CompanyDocumentService {
  async function listForCompany(companyId: UUID, includeDeleted = false): Promise<CompanyDocument[]> {
    let query = supabase.from("company_documents").select("*").eq("company_id", companyId);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list company documents: ${error.message}`);
    return (data as CompanyDocumentRow[]).map(rowToDocument);
  }

  async function create(input: {
    companyId: UUID;
    category: CompanyDocumentCategory;
    name: string;
    storagePath: string;
    fileType: string;
    fileSize: number;
    expirationDate?: string | null;
  }): Promise<CompanyDocument> {
    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("company_documents")
      .insert({
        company_id: input.companyId,
        category: input.category,
        name: input.name,
        storage_path: input.storagePath,
        file_type: input.fileType,
        file_size: input.fileSize,
        expiration_date: input.expirationDate ?? null,
        uploaded_by: actorId,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to save document: ${error.message}`);
    return rowToDocument(data as CompanyDocumentRow);
  }

  async function rename(documentId: UUID, name: string): Promise<CompanyDocument> {
    if (!name.trim()) throw new Error("Document name is required.");
    const { data, error } = await supabase
      .from("company_documents")
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", documentId)
      .select()
      .single();
    if (error) throw new Error(`Failed to rename document: ${error.message}`);
    return rowToDocument(data as CompanyDocumentRow);
  }

  async function updateExpiration(documentId: UUID, expirationDate: string | null): Promise<CompanyDocument> {
    const { data, error } = await supabase
      .from("company_documents")
      .update({ expiration_date: expirationDate, updated_at: new Date().toISOString() })
      .eq("id", documentId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update expiration date: ${error.message}`);
    return rowToDocument(data as CompanyDocumentRow);
  }

  async function softDelete(documentId: UUID, reason: string): Promise<void> {
    const check = validationService.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues[0]?.message ?? "A delete reason is required.");
    const actorId = await currentUserId();
    const { error } = await supabase
      .from("company_documents")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", documentId);
    if (error) throw new Error(`Failed to delete document: ${error.message}`);
  }

  async function restore(documentId: UUID): Promise<void> {
    const { error } = await supabase
      .from("company_documents")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null })
      .eq("id", documentId);
    if (error) throw new Error(`Failed to restore document: ${error.message}`);
  }

  return { listForCompany, create, rename, updateExpiration, softDelete, restore };
}
