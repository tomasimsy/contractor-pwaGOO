"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getTaxDashboard, getTaxSettings } from "@/lib/queries/tax";
import type { TaxDashboardData } from "@/lib/queries/tax";
import { ReportViewer, type ReportData } from "../components/ReportViewer";
import { ArrowLeft } from "lucide-react";

export default function ExpenseSummaryReport() {
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
            title: "Expense Summary",
            subtitle: "Complete breakdown of all business expenses by category",
            sections: [
              {
                title: "Direct Labor & Subcontractor Costs",
                items: [
                  {
                    label: "Subcontractor Payments (1099)",
                    value: financials.subcontractorPaid,
                  },
                  {
                    label: "Agent Commissions & Wages",
                    value: financials.agentPaid,
                  },
                ],
                subtotal: {
                  label: "Total Labor Costs",
                  value: financials.subcontractorPaid + financials.agentPaid,
                },
              },
              {
                title: "Materials & Supplies",
                items: [
                  {
                    label: "Materials & Equipment",
                    value: financials.expenseItems,
                  },
                  {
                    label: "Supplies & Consumables",
                    value: 0,
                  },
                ],
                subtotal: {
                  label: "Total Materials",
                  value: financials.expenseItems,
                },
              },
              {
                title: "Vehicle & Transportation",
                items: [
                  {
                    label: "Mileage Deduction",
                    value: financials.mileageCosts,
                  },
                  {
                    label: "Vehicle Maintenance",
                    value: 0,
                  },
                  {
                    label: "Fuel & Tolls",
                    value: 0,
                  },
                ],
                subtotal: {
                  label: "Total Vehicle Expenses",
                  value: financials.mileageCosts,
                },
              },
              {
                title: "Summary by Type",
                items: [
                  {
                    label: "Cost of Goods Sold (COGS)",
                    value: financials.expenseItems,
                    bold: true,
                  },
                  {
                    label: "Labor & Contractor Costs",
                    value: financials.subcontractorPaid + financials.agentPaid,
                    bold: true,
                  },
                  {
                    label: "Operating Expenses",
                    value: financials.mileageCosts,
                    bold: true,
                  },
                ],
                subtotal: {
                  label: "Total Operating Expenses",
                  value: financials.totalExpenses,
                },
              },
            ],
            notes: [
              "All expenses must be ordinary and necessary for business operations",
              "Subcontractor costs are 1099-tracked for year-end reporting",
              "Mileage deduction uses IRS standard mileage rates",
              "COGS includes materials directly tied to projects",
              "Keep supporting receipts for all deductible expenses",
              "Some expenses may require special schedules (depreciation, home office, etc.)",
            ],
          };

          setReportData(data);
        }
      } catch (error) {
        console.error("Error loading expense summary:", error);
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
