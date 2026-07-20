"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getAgentCompensationSummary, getTaxSettings } from "@/lib/queries/tax";
import { ReportViewer, type ReportData } from "../components/ReportViewer";
import { ArrowLeft } from "lucide-react";

export default function AgentEarningsReport() {
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

          const agentData = await getAgentCompensationSummary(cid, year);

          // Sort by total compensation descending
          const sortedAgents = [...agentData].sort((a, b) => b.total_compensation - a.total_compensation);

          const data: ReportData = {
            title: "Annual Agent Earnings",
            subtitle: "Year-to-date compensation summary per agent",
            sections: [
              {
                title: `Agent Earnings Summary - ${year}`,
                items: sortedAgents.map(agent => ({
                  label: agent.name,
                  value: agent.total_compensation,
                  bold: true,
                  highlight: false,
                })),
                subtotal: {
                  label: "Total Annual Agent Compensation",
                  value: sortedAgents.reduce((sum, a) => sum + a.total_compensation, 0),
                },
              },
              {
                title: "Compensation Composition",
                items: [
                  {
                    label: "Total Commissions",
                    value: sortedAgents.reduce((sum, a) => sum + a.total_commissions, 0),
                    bold: false,
                  },
                  {
                    label: "Total Reimbursements",
                    value: sortedAgents.reduce((sum, a) => sum + a.total_reimbursements, 0),
                    bold: false,
                  },
                ],
                subtotal: {
                  label: "Total Combined Earnings",
                  value: sortedAgents.reduce((sum, a) => sum + a.total_compensation, 0),
                },
              },
            ],
            notes: [
              "Annual earnings include all commissions and reimbursements for the calendar year",
              "This report should be used for year-end agent statements and tax planning",
              "Verify agent classification for proper tax treatment and reporting",
              "Employees: coordinate with payroll records and tax withholding",
              "Contractors: compare with 1099-NEC reporting thresholds if applicable",
              "Reconcile with bank statements to ensure all payments are recorded",
            ],
          };

          setReportData(data);
        }
      } catch (error) {
        console.error("Error loading agent earnings:", error);
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
