import type { ComplianceItem, ComplianceSummary } from "@/lib/services/subcontractorDocumentService";

/** Short labels for the compliance column. */
const SHORT: Record<ComplianceItem["key"], string> = {
  w9: "W-9",
  general_liability: "GL",
  workers_comp: "WC",
  license: "Lic",
  agreement: "Agmt",
};

const TONE: Record<ComplianceItem["state"], string> = {
  ok: "text-success",
  expiring: "text-warning",
  expired: "text-danger line-through",
  missing: "text-danger/80 line-through",
  not_needed: "text-muted-foreground/50",
};

/** One mark per document: green on file, amber expiring, red struck through when missing or expired. */
export function ComplianceMarks({ summary }: { summary: ComplianceSummary }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2 text-[12px] font-semibold">
      {summary.items
        .filter((i) => i.state !== "not_needed")
        .map((i) => (
          <span key={i.key} className={TONE[i.state]} title={`${i.label}: ${i.detail}`}>
            {SHORT[i.key]}
          </span>
        ))}
    </span>
  );
}

/** "GL expired Oct 1, 2026 · Missing W-9, Agmt", or "All on file". */
export function complianceIssueLine(summary: ComplianceSummary) {
  if (summary.issues.length === 0) return "All on file";
  const dated = summary.issues
    .filter((i) => i.state !== "missing")
    .map((i) => `${SHORT[i.key]} ${i.detail.charAt(0).toLowerCase() + i.detail.slice(1)}`);
  const missing = summary.issues.filter((i) => i.state === "missing").map((i) => SHORT[i.key]);
  return [...dated, ...(missing.length ? [`Missing ${missing.join(", ")}`] : [])].join(" · ");
}
