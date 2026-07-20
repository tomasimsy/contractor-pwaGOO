"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getTaxDashboard, getTaxSettings } from "@/lib/queries/tax";
import type { TaxDashboardData, TaxSettings } from "@/lib/queries/tax";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import { Settings, BarChart3, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

export default function TaxPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [taxData, setTaxData] = useState<TaxDashboardData | null>(null);
  const [settings, setSettings] = useState<TaxSettings | null>(null);
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    const init = async () => {
      try {
        const cid = await getCompanyId();
        if (cid) {
          setCompanyId(cid);

          // Get current tax year
          const now = new Date();
          const taxSettings = await getTaxSettings(cid);
          const taxYear = taxSettings?.tax_year || now.getFullYear();

          // Calculate fiscal year bounds
          const startMonth = taxSettings?.fiscal_year_start_month || 1;
          const endMonth = taxSettings?.fiscal_year_end_month || 12;

          const startDate = new Date(taxYear, startMonth - 1, 1);
          const endDate = new Date(taxYear, endMonth, 0);

          // Get tax dashboard data
          const data = await getTaxDashboard(cid, startDate, endDate);
          setTaxData(data);
          setSettings(data.taxSettings);
        }
      } catch (error) {
        console.error("Error loading tax data:", error);
        toast.error("Failed to load tax information");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/60 p-6 text-center text-xs font-medium text-slate-400 tracking-wide">
        Loading tax module...
      </div>
    );
  }

  const readiness = taxData?.readiness;

  return (
    <ProtectedRoute>
      <DesktopShell title="Tax & Compliance">
        <div className="min-h-screen bg-slate-50/50 md:bg-transparent">
          {/* Header */}
          <div className="border-b border-slate-200 bg-white px-6 py-6 md:px-0 md:py-4">
            <div className="mx-auto max-w-5xl">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Tax & Compliance</h1>
                  <p className="mt-1 text-sm text-slate-600">
                    Prepare for tax season year-round with reconciled financial data
                  </p>
                </div>
                <button
                  onClick={() => router.push("/tax/settings")}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
                >
                  <Settings size={16} />
                  Tax Settings
                </button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-0">
            {/* Tax Readiness Score */}
            {readiness && (
              <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Tax Readiness</h2>
                    <p className="mt-1 text-sm text-slate-600">Current status for {settings?.tax_year || new Date().getFullYear()}</p>
                  </div>

                  {/* Readiness Circle */}
                  <div className="flex flex-col items-center">
                    <div className="relative h-24 w-24">
                      <svg className="h-full w-full" viewBox="0 0 100 100">
                        {/* Background circle */}
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="#e2e8f0"
                          strokeWidth="8"
                        />
                        {/* Progress circle */}
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="#059669"
                          strokeWidth="8"
                          strokeDasharray={`${(readiness.score / 100) * 283} 283`}
                          strokeLinecap="round"
                          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="text-2xl font-bold text-slate-900">{readiness.score}%</div>
                        <div className="text-xs font-medium text-slate-600">Ready</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Checks */}
                <div className="space-y-3 border-t border-slate-200 pt-6">
                  <div className="flex items-center gap-3">
                    {readiness.checks.revenue_reconciled ? (
                      <CheckCircle2 size={20} className="text-emerald-600" />
                    ) : (
                      <AlertTriangle size={20} className="text-amber-600" />
                    )}
                    <span className="text-sm text-slate-700">Revenue reconciled</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {readiness.checks.expenses_categorized ? (
                      <CheckCircle2 size={20} className="text-emerald-600" />
                    ) : (
                      <AlertTriangle size={20} className="text-amber-600" />
                    )}
                    <span className="text-sm text-slate-700">Expenses categorized</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {readiness.checks.payments_matched ? (
                      <CheckCircle2 size={20} className="text-emerald-600" />
                    ) : (
                      <AlertTriangle size={20} className="text-amber-600" />
                    )}
                    <span className="text-sm text-slate-700">Payments matched to invoices</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {readiness.checks.contractors_reviewed ? (
                      <CheckCircle2 size={20} className="text-emerald-600" />
                    ) : (
                      <AlertTriangle size={20} className="text-amber-600" />
                    )}
                    <span className="text-sm text-slate-700">Contractors reviewed for 1099</span>
                  </div>
                </div>

                {/* Warnings */}
                {Object.values(readiness.warnings).some(v => v > 0) && (
                  <div className="mt-6 space-y-2 border-t border-slate-200 pt-6">
                    <h3 className="text-sm font-semibold text-slate-900">Warnings</h3>
                    {readiness.warnings.missing_receipts > 0 && (
                      <div className="flex items-center gap-2 text-sm text-amber-700">
                        <AlertTriangle size={16} />
                        <span>{readiness.warnings.missing_receipts} expenses missing receipts</span>
                      </div>
                    )}
                    {readiness.warnings.uncategorized_expenses > 0 && (
                      <div className="flex items-center gap-2 text-sm text-amber-700">
                        <AlertTriangle size={16} />
                        <span>{readiness.warnings.uncategorized_expenses} expenses uncategorized</span>
                      </div>
                    )}
                    {readiness.warnings.missing_w9_info > 0 && (
                      <div className="flex items-center gap-2 text-sm text-rose-700">
                        <AlertTriangle size={16} />
                        <span>{readiness.warnings.missing_w9_info} contractors missing W9 forms</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Quick Links */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <button
                onClick={() => router.push("/tax/dashboard")}
                className="flex flex-col items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-slate-300 hover:shadow-md transition"
              >
                <BarChart3 size={24} className="text-emerald-600" />
                <div>
                  <div className="font-semibold text-slate-900">Tax Dashboard</div>
                  <div className="text-xs text-slate-600">View tax overview & metrics</div>
                </div>
              </button>

              <button
                onClick={() => router.push("/tax/reports")}
                className="flex flex-col items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-slate-300 hover:shadow-md transition"
              >
                <FileText size={24} className="text-blue-600" />
                <div>
                  <div className="font-semibold text-slate-900">CPA Reports</div>
                  <div className="text-xs text-slate-600">Generate tax-ready reports</div>
                </div>
              </button>

              <button
                onClick={() => router.push("/tax/contractors")}
                className="flex flex-col items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-slate-300 hover:shadow-md transition"
              >
                <FileText size={24} className="text-purple-600" />
                <div>
                  <div className="font-semibold text-slate-900">1099 Tracking</div>
                  <div className="text-xs text-slate-600">Subcontractor & agent tracking</div>
                </div>
              </button>

              <button
                onClick={() => router.push("/tax/audit")}
                className="flex flex-col items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-slate-300 hover:shadow-md transition"
              >
                <AlertTriangle size={24} className="text-amber-600" />
                <div>
                  <div className="font-semibold text-slate-900">Audit Scanner</div>
                  <div className="text-xs text-slate-600">Data quality checks</div>
                </div>
              </button>
            </div>

            {/* Tax Year Setting */}
            {settings && (
              <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-sm text-slate-600">
                  <span className="font-semibold">Current Tax Year:</span> {settings.tax_year} •{" "}
                  <span className="font-semibold">Entity:</span> {settings.entity_type.replace(/_/g, " ").toUpperCase()} •{" "}
                  <span className="font-semibold">Method:</span> {settings.accounting_method.toUpperCase()}
                </div>
              </div>
            )}
          </div>
        </div>
      </DesktopShell>
    </ProtectedRoute>
  );
}
