"use client";

import { useEffect, useState } from "react";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { runTaxAudit, getTaxSettings } from "@/lib/queries/tax";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import { AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface AuditIssue {
  type: string;
  severity: "info" | "warning" | "error";
  count: number;
  message: string;
}

export default function TaxAuditPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const init = async () => {
      try {
        const cid = await getCompanyId();
        if (cid) {
          const settings = await getTaxSettings(cid);
          const year = settings?.tax_year || new Date().getFullYear();
          setTaxYear(year);

          const auditIssues = await runTaxAudit(cid, year);
          setIssues(auditIssues);
        }
      } catch (error) {
        console.error("Error running tax audit:", error);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/60">
        <div className="text-center">
          <div className="text-slate-400">Running tax audit...</div>
        </div>
      </div>
    );
  }

  const errorCount = issues.filter(i => i.severity === "error").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;
  const allGood = issues.length === 0;

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "error":
        return <AlertTriangle size={20} className="text-rose-600" />;
      case "warning":
        return <AlertTriangle size={20} className="text-amber-600" />;
      default:
        return <CheckCircle2 size={20} className="text-emerald-600" />;
    }
  };

  const severityBg = (severity: string) => {
    switch (severity) {
      case "error":
        return "bg-rose-50 border-rose-200";
      case "warning":
        return "bg-amber-50 border-amber-200";
      default:
        return "bg-emerald-50 border-emerald-200";
    }
  };

  return (
    <ProtectedRoute>
      <DesktopShell title="Tax Audit Scanner">
        <div className="min-h-screen bg-slate-50/50 md:bg-transparent">
          {/* Header */}
          <div className="border-b border-slate-200 bg-white px-6 py-4 md:px-0">
            <div className="mx-auto max-w-4xl">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Tax Audit Scanner</h1>
                  <p className="text-sm text-slate-600">
                    Financial data quality check for {taxYear}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="mx-auto max-w-4xl px-4 py-6 md:px-0">
            {/* Summary Cards */}
            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Issues Found
                </div>
                <div className="mt-2 text-3xl font-bold text-slate-900">{issues.length}</div>
              </div>

              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-rose-600">
                  Errors
                </div>
                <div className="mt-2 text-3xl font-bold text-rose-900">{errorCount}</div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                  Warnings
                </div>
                <div className="mt-2 text-3xl font-bold text-amber-900">{warningCount}</div>
              </div>
            </div>

            {/* Results */}
            {allGood ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center">
                <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-600" />
                <h2 className="text-2xl font-bold text-emerald-900">All Systems Green</h2>
                <p className="mt-2 text-emerald-800">
                  Your financial data is clean and ready for tax filing.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-4 rounded-lg border p-4 ${severityBg(issue.severity)}`}
                  >
                    <div className="mt-0.5 shrink-0">{severityIcon(issue.severity)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900">{issue.message}</div>
                      {issue.count > 1 && (
                        <div className="mt-1 text-xs text-slate-600">
                          Count: {issue.count} items
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">
                      <button
                        onClick={() => {
                          // Route to the relevant page
                          switch (issue.type) {
                            case "missing_tax_category":
                              router.push("/expense");
                              break;
                            case "missing_receipt":
                              router.push("/expense");
                              break;
                            case "missing_w9":
                              router.push("/tax/contractors");
                              break;
                            case "unmatched_payment":
                              router.push("/invoices");
                              break;
                            default:
                              break;
                          }
                        }}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline"
                      >
                        Review
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer Note */}
            <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-900">About This Audit</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li>✓ Checks for expenses missing tax categories</li>
                <li>✓ Identifies expenses without receipt documentation</li>
                <li>✓ Verifies 1099-eligible contractors have W9 forms</li>
                <li>✓ Ensures payments are matched to invoices</li>
                <li>✓ Validates all data connections and relationships</li>
              </ul>
            </div>
          </div>
        </div>
      </DesktopShell>
    </ProtectedRoute>
  );
}
