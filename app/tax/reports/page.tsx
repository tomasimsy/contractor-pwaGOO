"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getTaxSettings, getTaxDashboard } from "@/lib/queries/tax";
import type { TaxDashboardData } from "@/lib/queries/tax";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import { formatCurrency } from "@/lib/utils/formatting";
import { ArrowLeft, FileText } from "lucide-react";
import toast from "react-hot-toast";

const REPORTS = [
  {
    category: "Financial Statements",
    items: [
      {
        title: "Profit & Loss Statement",
        description: "Revenue, expenses, and net profit",
        icon: "📊",
        href: "/tax/reports/profit-loss",
      },
      {
        title: "Revenue Summary",
        description: "By project, client, and source",
        icon: "💰",
        href: "/tax/reports/revenue-summary",
      },
      {
        title: "Expense Summary",
        description: "By category and project",
        icon: "📉",
        href: "/tax/reports/expense-summary",
      },
    ],
  },
  {
    category: "Contractor Reports",
    items: [
      {
        title: "1099 Payment Summary",
        description: "Subcontractor payments and forms",
        icon: "📋",
        href: "/tax/reports/1099-summary",
      },
      {
        title: "W9 Status Report",
        description: "Contractor W9 documentation status",
        icon: "✓",
        href: "/tax/reports/w9-status",
      },
    ],
  },
  {
    category: "Agent Reports",
    items: [
      {
        title: "Agent Compensation Summary",
        description: "Commissions, bonuses, and reimbursements",
        icon: "👥",
        href: "/tax/reports/agent-compensation",
      },
      {
        title: "Annual Agent Earnings",
        description: "Year-to-date compensation per agent",
        icon: "📈",
        href: "/tax/reports/agent-earnings",
      },
    ],
  },
];

export default function TaxReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [taxData, setTaxData] = useState<TaxDashboardData | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const cid = await getCompanyId();
        if (cid) {
          const settings = await getTaxSettings(cid);
          const taxYear = settings?.tax_year || new Date().getFullYear();
          const startMonth = settings?.fiscal_year_start_month || 1;
          const endMonth = settings?.fiscal_year_end_month || 12;

          const startDate = new Date(taxYear, startMonth - 1, 1);
          const endDate = new Date(taxYear, endMonth, 0);

          const data = await getTaxDashboard(cid, startDate, endDate);
          setTaxData(data);
        }
      } catch (error) {
        console.error("Error loading tax data:", error);
        toast.error("Failed to load tax data");
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
          <div className="text-slate-400">Loading reports...</div>
        </div>
      </div>
    );
  }

  const financials = taxData?.financials;

  return (
    <ProtectedRoute>
      <DesktopShell title="CPA-Ready Reports">
        <div className="min-h-screen bg-slate-50/50 md:bg-transparent">
          {/* Header */}
          <div className="border-b border-slate-200 bg-white px-6 py-4 md:px-0">
            <div className="mx-auto max-w-5xl">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">CPA-Ready Reports</h1>
                  <p className="text-sm text-slate-600">Professional reports for tax filing</p>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-0">
            {/* Report Categories */}
            {REPORTS.map((category, idx) => (
              <div key={idx} className="mb-8">
                <h2 className="mb-4 text-lg font-bold text-slate-900">{category.category}</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {category.items.map((report, itemIdx) => (
                    <button
                      key={itemIdx}
                      onClick={() => router.push(report.href)}
                      className="flex flex-col items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-slate-300 hover:shadow-md transition"
                    >
                      <div className="text-2xl">{report.icon}</div>
                      <div>
                        <div className="font-semibold text-slate-900">{report.title}</div>
                        <div className="text-xs text-slate-600">{report.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Summary */}
            {financials && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 my-8">
                <h2 className="mb-4 text-lg font-bold text-slate-900">Financial Summary</h2>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Total Revenue
                    </div>
                    <div className="mt-1 text-xl font-bold text-slate-900">
                      {formatCurrency(financials.totalRevenue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Total Expenses
                    </div>
                    <div className="mt-1 text-xl font-bold text-slate-900">
                      {formatCurrency(financials.totalExpenses)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Net Profit
                    </div>
                    <div className="mt-1 text-xl font-bold text-emerald-700">
                      {formatCurrency(financials.netProfit)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Collected Payments
                    </div>
                    <div className="mt-1 text-xl font-bold text-slate-900">
                      {formatCurrency(financials.totalPaid)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Data Source Notice */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="font-semibold text-emerald-900">✓ CPA-Ready Data</h3>
              <p className="mt-2 text-sm text-emerald-800">
                All reports are generated from the unified financial calculation engine. Numbers match across all pages and reports. This data is audit-ready and verified for accuracy.
              </p>
            </div>
          </div>
        </div>
      </DesktopShell>
    </ProtectedRoute>
  );
}
