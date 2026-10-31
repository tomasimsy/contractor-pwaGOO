import { describe, expect, it } from "vitest";
import {
  complianceWarning,
  subcontractorCompliance,
  type SubDocumentType,
  type SubcontractorDocument,
} from "@/lib/services/subcontractorDocumentService";

const TODAY = "2026-10-29";
let n = 0;
function doc(docType: SubDocumentType, expirationDate: string | null = null, extra: Partial<SubcontractorDocument> = {}): SubcontractorDocument {
  n += 1;
  return {
    id: `d${n}`,
    companyId: "c1",
    subcontractorId: "s1",
    docType,
    name: docType,
    storagePath: `p${n}`,
    fileType: "application/pdf",
    fileSize: 1,
    issuedDate: null,
    expirationDate,
    carrier: null,
    policyNumber: null,
    coverageAmount: null,
    additionalInsured: null,
    notes: null,
    createdBy: null,
    createdAt: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`,
    updatedBy: null,
    updatedAt: "2026-01-01",
    deletedBy: null,
    deletedAt: null,
    deleteReason: null,
    ...extra,
  };
}
const state = (s: ReturnType<typeof subcontractorCompliance>, key: string) => s.items.find((i) => i.key === key)?.state;

describe("subcontractorCompliance", () => {
  it("a sub with nothing on file is missing every required document", () => {
    const s = subcontractorCompliance({ entityType: null, licenseNumber: null }, [], TODAY);
    expect(state(s, "w9")).toBe("missing");
    expect(state(s, "general_liability")).toBe("missing");
    expect(state(s, "workers_comp")).toBe("missing");
    expect(state(s, "agreement")).toBe("missing");
    expect(state(s, "license")).toBe("not_needed");
    expect(s.worst).toBe("problem");
    expect(s.needs1099).toBeNull();
  });

  it("is fully compliant with current documents", () => {
    const s = subcontractorCompliance(
      { entityType: "llc", licenseNumber: null },
      [doc("w9"), doc("general_liability", "2027-06-01"), doc("workers_comp", "2027-06-01"), doc("agreement")],
      TODAY
    );
    expect(s.issues).toEqual([]);
    expect(s.worst).toBe("ok");
    expect(s.needs1099).toBe(true);
  });

  it("flags expired and expiring certificates", () => {
    const s = subcontractorCompliance(
      { entityType: "c_corp", licenseNumber: null },
      [doc("w9"), doc("general_liability", "2026-10-01"), doc("workers_comp", "2026-11-15"), doc("agreement")],
      TODAY
    );
    expect(state(s, "general_liability")).toBe("expired");
    expect(state(s, "workers_comp")).toBe("expiring");
    expect(s.worst).toBe("problem");
    expect(s.needs1099).toBe(false);
    expect(complianceWarning(s)).toBe("General liability expired Oct 1, 2026");
  });

  it("a renewed certificate clears the old expired one", () => {
    const s = subcontractorCompliance(
      { entityType: "llc", licenseNumber: null },
      [doc("general_liability", "2026-10-01"), doc("general_liability", "2027-10-01")],
      TODAY
    );
    expect(state(s, "general_liability")).toBe("ok");
  });

  it("lists missing documents in one phrase after any expired ones", () => {
    const s = subcontractorCompliance(
      { entityType: null, licenseNumber: null },
      [doc("general_liability", "2026-10-01"), doc("workers_comp", "2027-06-01")],
      TODAY
    );
    expect(complianceWarning(s)).toBe("General liability expired Oct 1, 2026 · Missing W-9, agreement");
  });

  it("a workers' comp exemption satisfies workers' comp", () => {
    const s = subcontractorCompliance({ entityType: "sole_prop", licenseNumber: null }, [doc("wc_exemption", "2027-03-01")], TODAY);
    expect(state(s, "workers_comp")).toBe("ok");
    expect(s.items.find((i) => i.key === "workers_comp")?.detail).toMatch(/^Exempt/);
  });

  it("requires a license document only when a license number is recorded", () => {
    expect(state(subcontractorCompliance({ entityType: null, licenseNumber: "R-123" }, [], TODAY), "license")).toBe("missing");
  });

  it("ignores deleted documents", () => {
    const s = subcontractorCompliance({ entityType: null, licenseNumber: null }, [doc("w9", null, { deletedAt: "2026-10-01" })], TODAY);
    expect(state(s, "w9")).toBe("missing");
  });

  it("only expiring documents count as expiring, not as a problem", () => {
    const s = subcontractorCompliance(
      { entityType: "llc", licenseNumber: null },
      [doc("w9"), doc("general_liability", "2026-11-20"), doc("workers_comp", "2027-06-01"), doc("agreement")],
      TODAY
    );
    expect(s.worst).toBe("expiring");
    expect(complianceWarning(s)).toBeNull();
  });
});
