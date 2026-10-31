/**
 * Real Supabase-backed SubcontractorDocumentService over
 * `subcontractor_documents` (migration 20261029020000). Same shape as
 * the company documents service: metadata rows here, files in the
 * private `company-documents` bucket.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SubDocumentDetails,
  SubDocumentType,
  SubcontractorDocument,
  SubcontractorDocumentService,
} from "../subcontractorDocumentService";
import type { UUID } from "../types";
import type { ValidationService } from "../validationService";

interface Row {
  id: string;
  company_id: string;
  subcontractor_id: string;
  doc_type: string;
  name: string;
  storage_path: string;
  file_type: string;
  file_size: number;
  issued_date: string | null;
  expiration_date: string | null;
  carrier: string | null;
  policy_number: string | null;
  coverage_amount: number | string | null;
  additional_insured: boolean | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

function rowToDocument(row: Row): SubcontractorDocument {
  return {
    id: row.id as UUID,
    companyId: row.company_id as UUID,
    subcontractorId: row.subcontractor_id as UUID,
    docType: row.doc_type as SubDocumentType,
    name: row.name,
    storagePath: row.storage_path,
    fileType: row.file_type,
    fileSize: Number(row.file_size ?? 0),
    issuedDate: row.issued_date,
    expirationDate: row.expiration_date,
    carrier: row.carrier,
    policyNumber: row.policy_number,
    coverageAmount: row.coverage_amount == null ? null : Number(row.coverage_amount),
    additionalInsured: row.additional_insured,
    notes: row.notes,
    createdBy: row.uploaded_by as UUID | null,
    createdAt: row.created_at,
    updatedBy: null,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by as UUID | null,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

const DETAIL_COLUMN: Record<keyof SubDocumentDetails, string> = {
  docType: "doc_type",
  name: "name",
  issuedDate: "issued_date",
  expirationDate: "expiration_date",
  carrier: "carrier",
  policyNumber: "policy_number",
  coverageAmount: "coverage_amount",
  additionalInsured: "additional_insured",
  notes: "notes",
};

function detailColumns(changes: Partial<SubDocumentDetails>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(DETAIL_COLUMN) as Array<[keyof SubDocumentDetails, string]>) {
    if (changes[key] !== undefined) out[column] = changes[key];
  }
  return out;
}

export function createSupabaseSubcontractorDocumentService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  currentUserId: () => Promise<UUID | null>
): SubcontractorDocumentService {
  async function list(column: "company_id" | "subcontractor_id", value: UUID) {
    const { data, error } = await supabase
      .from("subcontractor_documents")
      .select("*")
      .eq(column, value)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load subcontractor documents: ${error.message}`);
    return (data as Row[]).map(rowToDocument);
  }

  async function create(
    input: { companyId: UUID; subcontractorId: UUID; storagePath: string; fileType: string; fileSize: number } & Partial<SubDocumentDetails> &
      Pick<SubDocumentDetails, "docType" | "name">
  ): Promise<SubcontractorDocument> {
    const { companyId, subcontractorId, storagePath, fileType, fileSize, ...details } = input;
    const { data, error } = await supabase
      .from("subcontractor_documents")
      .insert({
        company_id: companyId,
        subcontractor_id: subcontractorId,
        storage_path: storagePath,
        file_type: fileType,
        file_size: fileSize,
        ...detailColumns(details),
        uploaded_by: await currentUserId(),
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to save document: ${error.message}`);
    return rowToDocument(data as Row);
  }

  async function update(documentId: UUID, changes: Partial<SubDocumentDetails>): Promise<SubcontractorDocument> {
    if (changes.name !== undefined && !changes.name.trim()) throw new Error("Document name is required.");
    const { data, error } = await supabase
      .from("subcontractor_documents")
      .update({ ...detailColumns(changes), updated_at: new Date().toISOString() })
      .eq("id", documentId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update document: ${error.message}`);
    return rowToDocument(data as Row);
  }

  async function softDelete(documentId: UUID, reason: string): Promise<void> {
    const check = validationService.validateDeleteReason(reason);
    if (!check.valid) throw new Error(check.issues[0]?.message ?? "A delete reason is required.");
    const { error } = await supabase
      .from("subcontractor_documents")
      .update({ deleted_at: new Date().toISOString(), deleted_by: await currentUserId(), delete_reason: reason })
      .eq("id", documentId);
    if (error) throw new Error(`Failed to delete document: ${error.message}`);
  }

  return {
    listForCompany: (companyId) => list("company_id", companyId),
    listForSubcontractor: (subcontractorId) => list("subcontractor_id", subcontractorId),
    create,
    update,
    softDelete,
  };
}
