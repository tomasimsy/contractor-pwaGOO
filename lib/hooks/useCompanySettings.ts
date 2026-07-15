// Thin backward-compatible wrapper around the shared CompanyProvider —
// prefer importing useCompany() from "@/context/CompanyContext" directly
// in new code; this just avoids touching every existing call site.
export { useCompany as useCompanySettings } from "@/context/CompanyContext";
