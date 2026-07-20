"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getTaxDashboard, getTaxSettings } from "@/lib/queries/tax";
import type { TaxDashboardData } from "@/lib/queries/tax";
import { ReportViewer, type ReportData } from "../components/ReportViewer";
import { ArrowLeft } from "lucide-react";

export default function RevenueSummaryReport() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const init = async () => {
      try {
        const cid = await getCompanyId();
        if (cid) {
          const settings = await getTaxSettings(cid);
          const year = settings?.tax_year || new Date().getFullYear();
          setTaxYear(year);

          const startMonth = settings?.fiscal_year_start_month || 1;
          const endMonth = settings?.fiscal_year_end_month || 12;
          const startDate = new Date(year, startMonth - 1, 1);
          const endDate = new Date(year, endMonth, 0);

          const taxData = await getTaxDashboard(cid, startDate, endDate);
          const financials = taxData.financials;

          const data: ReportData = {
            title: "Revenue Summary",
            subtitle: "Detailed breakdown of all business income",
            sections: [
              {
                title: "Cash Collections",
                items: [
                  {
                    label: "Payments Received",
                    value: financials.totalRevenue,
                    bold: true,
                    highlight: true,
                  },
                  {
                    label: "Outstanding Receivables",
                    value: financials.totalOutstanding,
                    bold: true,
                    highlight: true,
                  },
                ],
                subtotal: {
                  label: "Total Invoiced",
                  value: financials.totalInvoiced,
                },
              },
              {
                title: "Collection Status",
                items: [
                  {
                    label: "Total Invoiced (for period)",
                    value: financials.totalInvoiced,
                  },
                  {
                    label: "Payments Received (for period)",
                    value: financials.totalRevenue,
                  },
                  {
                    label: "Collection Rate",
                    value: financials.totalInvoiced > 0 ? Math.round((financials.totalRevenue / financials.totalInvoiced) * 100) : 0,
                    format: "percent",
                  },
                ],
                subtotal: {
                  label: "Outstanding (Not Yet Paid)",
                  value: financials.totalOutstanding,
                },
              },
            ],
            notes: [
              "Revenue represents all billable work completed during the tax year",
              "Includes approved change orders and price adjustments",
              "Outstanding receivables represent amounts invoiced but not yet paid",
              "Accrual basis: all revenue is counted when invoiced",
              "Cash basis: only paid amounts are counted as income",
            ],
          };

          setReportData(data);
        }
      } catch (error) {
        console.error("Error loading revenue summary:", error);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400">Loading report...</div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400">No data available</div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="fixed top-6 left-6 z-50 flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
      >
        <ArrowLeft size={16} />
        Back
      </button>
      <ReportViewer data={reportData} taxYear={taxYear} />
    </div>
  );
}
