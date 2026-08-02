/**
 * Layer 2 — owns `company_documents` (metadata) + the `company-documents`
 * Supabase Storage bucket (the actual files). Same split as
 * EstimatePhotoService: this service never touches the file bytes
 * (upload/download go through app/api/company-documents/* routes,
 * mirroring app/api/estimate-photos/*), it only owns the row that says
 * which category/name/expiration a given storage path represents.
 */
import type { UUID, AuditedEntity } from "./types";

export const COMPANY_DOCUMENT_CATEGORIES = [
  "llc_articles",
  "ein_letter",
  "irs_documents",
  "w9",
  "form_1099",
  "business_license",
  "contractor_license",
  "insurance",
  "workers_comp",
  "bond",
  "banking",
  "tax_documents",
  "other",
] as const;
export type CompanyDocumentCategory = (typeof COMPANY_DOCUMENT_CATEGORIES)[number];

export const COMPANY_DOCUMENT_CATEGORY_LABEL: Record<CompanyDocumentCategory, string> = {
  llc_articles: "LLC / Articles of Organization",
  ein_letter: "EIN Letter",
  irs_documents: "IRS Documents",
  w9: "W-9",
  form_1099: "1099",
  business_license: "Business License",
  contractor_license: "Contractor License",
  insurance: "Insurance",
  workers_comp: "Workers Comp",
  bond: "Bond",
  banking: "Banking",
  tax_documents: "Tax Documents",
  other: "Other",
};

export interface CompanyDocument extends AuditedEntity {
  category: CompanyDocumentCategory;
  name: string;
  storagePath: string;
  fileType: string;
  fileSize: number;
  expirationDate: string | null;
  uploadedBy: UUID | null;
}

export interface CompanyDocumentService {
  listForCompany(companyId: UUID, includeDeleted?: boolean): Promise<CompanyDocument[]>;

  /** Metadata-only — the actual file bytes are written by
   * app/api/company-documents/upload, which calls this AFTER the
   * Storage upload succeeds (same order EstimatePhotoService's upload
   * route already uses). */
  create(input: {
    companyId: UUID;
    category: CompanyDocumentCategory;
    name: string;
    storagePath: string;
    fileType: string;
    fileSize: number;
    expirationDate?: string | null;
  }): Promise<CompanyDocument>;

  rename(documentId: UUID, name: string): Promise<CompanyDocument>;

  updateExpiration(documentId: UUID, expirationDate: string | null): Promise<CompanyDocument>;

  softDelete(documentId: UUID, reason: string): Promise<void>;
  restore(documentId: UUID): Promise<void>;
}
