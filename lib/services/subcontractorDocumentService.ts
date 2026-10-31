/**
 * Layer 2 — owns `subcontractor_documents` (metadata). The file bytes
 * live in the private `company-documents` bucket and are written by
 * app/api/subcontractor-documents/upload, the same split
 * CompanyDocumentService uses: this service only owns the row saying
 * which sub, which document type and which dates a storage path is.
 *
 * Compliance (what is missing or expired) is a pure function of these
 * rows plus the sub's entity type — see `subcontractorCompliance`.
 */
import type { UUID, AuditedEntity } from "./types";
import type { Subcontractor } from "./subcontractorService";

export const SUB_DOCUMENT_TYPES = [
  "w9",
  "general_liability",
  "workers_comp",
  "wc_exemption",
  "license",
  "agreement",
  "auto_insurance",
  "other",
] as const;
export type SubDocumentType = (typeof SUB_DOCUMENT_TYPES)[number];

export const SUB_DOCUMENT_TYPE_LABEL: Record<SubDocumentType, string> = {
  w9: "W-9",
  general_liability: "General liability certificate",
  workers_comp: "Workers' comp certificate",
  wc_exemption: "Workers' comp exemption",
  license: "Contractor license",
  agreement: "Subcontractor agreement",
  auto_insurance: "Commercial auto certificate",
  other: "Other",
};

/** Types that carry carrier / policy / coverage fields. */
export const INSURANCE_DOCUMENT_TYPES: ReadonlySet<SubDocumentType> = new Set([
  "general_liability",
  "workers_comp",
  "auto_insurance",
]);

export interface SubcontractorDocument extends AuditedEntity {
  subcontractorId: UUID;
  docType: SubDocumentType;
  name: string;
  storagePath: string;
  fileType: string;
  fileSize: number;
  issuedDate: string | null;
  expirationDate: string | null;
  carrier: string | null;
  policyNumber: string | null;
  coverageAmount: number | null;
  additionalInsured: boolean | null;
  notes: string | null;
}

/** The editable details of a document (the file itself is replaced by uploading a new one). */
export type SubDocumentDetails = Pick<
  SubcontractorDocument,
  "docType" | "name" | "issuedDate" | "expirationDate" | "carrier" | "policyNumber" | "coverageAmount" | "additionalInsured" | "notes"
>;

export interface SubcontractorDocumentService {
  /** All live documents for the company — the roster's compliance column reads these. */
  listForCompany(companyId: UUID): Promise<SubcontractorDocument[]>;
  listForSubcontractor(subcontractorId: UUID): Promise<SubcontractorDocument[]>;

  /** Metadata only — called by the upload route AFTER the file landed in Storage. */
  create(
    input: { companyId: UUID; subcontractorId: UUID; storagePath: string; fileType: string; fileSize: number } & Partial<SubDocumentDetails> &
      Pick<SubDocumentDetails, "docType" | "name">
  ): Promise<SubcontractorDocument>;

  update(documentId: UUID, changes: Partial<SubDocumentDetails>): Promise<SubcontractorDocument>;
  softDelete(documentId: UUID, reason: string): Promise<void>;
}

// ---------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------

/** Days before expiry that a document counts as "expiring soon". */
export const EXPIRING_SOON_DAYS = 30;

export type ComplianceState = "ok" | "expiring" | "expired" | "missing" | "not_needed";

export interface ComplianceItem {
  key: "w9" | "general_liability" | "workers_comp" | "license" | "agreement";
  label: string;
  state: ComplianceState;
  /** The governing document's expiration, when it has one. */
  expirationDate: string | null;
  /** Short text for the UI: "Exp Mar 3, 2027", "Expired Oct 1", "Missing". */
  detail: string;
}

export interface ComplianceSummary {
  items: ComplianceItem[];
  /** Items that need action: missing, expired or expiring. */
  issues: ComplianceItem[];
  /** The worst state across the required items. */
  worst: "ok" | "expiring" | "problem";
  /** Corporations usually don't get a 1099. Null when the entity type is unknown. */
  needs1099: boolean | null;
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * What a sub is missing. Required: W-9, general liability, workers' comp
 * (a certificate OR an exemption), a signed agreement. A license is
 * tracked when one is on file or a license number is recorded; it is not
 * required, because not every state licenses every trade.
 *
 * For each type the document with the LATEST expiration (or the newest
 * upload, for types that don't expire) is the one that counts, so
 * uploading a renewed certificate clears the warning without deleting
 * the old one.
 */
export function subcontractorCompliance(
  sub: Pick<Subcontractor, "entityType" | "licenseNumber">,
  docs: SubcontractorDocument[],
  today: string = new Date().toISOString().slice(0, 10)
): ComplianceSummary {
  const live = docs.filter((d) => !d.deletedAt);
  const soon = addDays(today, EXPIRING_SOON_DAYS);

  const best = (types: SubDocumentType[]) => {
    const pool = live.filter((d) => types.includes(d.docType));
    if (pool.length === 0) return null;
    // A document with no expiration never expires, so it beats any dated one.
    return pool.reduce((a, b) => {
      const ea = a.expirationDate ?? "9999-12-31";
      const eb = b.expirationDate ?? "9999-12-31";
      return eb > ea || (eb === ea && b.createdAt > a.createdAt) ? b : a;
    });
  };

  const item = (key: ComplianceItem["key"], label: string, types: SubDocumentType[], required: boolean): ComplianceItem => {
    const doc = best(types);
    if (!doc) {
      return { key, label, state: required ? "missing" : "not_needed", expirationDate: null, detail: required ? "Missing" : "—" };
    }
    const exp = doc.expirationDate;
    if (exp && exp < today) return { key, label, state: "expired", expirationDate: exp, detail: `Expired ${shortDate(exp)}` };
    if (exp && exp <= soon) return { key, label, state: "expiring", expirationDate: exp, detail: `Exp ${shortDate(exp)}` };
    const exempt = doc.docType === "wc_exemption" ? "Exempt" : "On file";
    return { key, label, state: "ok", expirationDate: exp, detail: exp ? `${exempt === "Exempt" ? "Exempt · " : ""}Exp ${shortDate(exp)}` : exempt };
  };

  const items: ComplianceItem[] = [
    item("w9", "W-9", ["w9"], true),
    item("general_liability", "General liability", ["general_liability"], true),
    item("workers_comp", "Workers' comp", ["workers_comp", "wc_exemption"], true),
    item("license", "License", ["license"], !!sub.licenseNumber),
    item("agreement", "Agreement", ["agreement"], true),
  ];
  const issues = items.filter((i) => i.state === "missing" || i.state === "expired" || i.state === "expiring");
  const worst = issues.some((i) => i.state !== "expiring") ? "problem" : issues.length > 0 ? "expiring" : "ok";
  const needs1099 = sub.entityType == null ? null : !(sub.entityType === "c_corp" || sub.entityType === "s_corp");
  return { items, issues, worst, needs1099 };
}

/** One line for warnings elsewhere (Payroll, the estimate):
 * "General liability expired Oct 1, 2026 · Missing W-9, agreement". */
export function complianceWarning(summary: ComplianceSummary): string | null {
  const expired = summary.issues.filter((i) => i.state === "expired");
  const missing = summary.issues.filter((i) => i.state === "missing");
  if (expired.length === 0 && missing.length === 0) return null;
  const parts = expired.map((i) => `${i.label} expired ${shortDate(i.expirationDate as string)}`);
  if (missing.length > 0) {
    parts.push(`Missing ${missing.map((i, n) => (n === 0 || i.key === "w9" ? i.label : i.label.toLowerCase())).join(", ")}`);
  }
  return parts.join(" · ");
}
