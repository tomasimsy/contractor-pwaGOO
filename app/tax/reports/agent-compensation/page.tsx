"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getAgentCompensationSummary, getTaxSettings } from "@/lib/queries/tax";
import { ReportViewer, type ReportData } from "../components/ReportViewer";
import { ArrowLeft } from "lucide-react";

export default function AgentCompensationReport() {
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

          const totalCommissions = agentData.reduce((sum, a) => sum + a.total_commissions, 0);
          const totalReimbursements = agentData.reduce((sum, a) => sum + a.total_reimbursements, 0);
          const totalCompensation = agentData.reduce((sum, a) => sum + a.total_compensation, 0);

          const data: ReportData = {
            title: "Agent Compensation Summary",
            subtitle: "Commissions, bonuses, and reimbursements by agent",
            sections: [
              {
                title: "Agent Compensation Breakdown",
                items: agentData.flatMap(agent => [
                  {
                    label: agent.name,
                    value: 0,
                    bold: true,
                    indent: false,
                  },
                  {
                    label: "  Commissions",
                    value: agent.total_commissions,
                    bold: false,
                    indent: true,
                  },
                  {
                    label: "  Reimbursements",
                    value: agent.total_reimbursements,
                    bold: false,
                    indent: true,
                  },
                ]),
              },
              {
                title: "Totals by Category",
                items: [
                  {
                    label: "Total Commissions",
                    value: totalCommissions,
                    bold: true,
                  },
                  {
                    label: "Total Reimbursements",
                    value: totalReimbursements,
                    bold: true,
                  },
                ],
                subtotal: {
                  label: "Total Agent Compensation",
                  value: totalCompensation,
                },
              },
            ],
            notes: [
              "Agent compensation includes commissions, bonuses, and reimbursements",
              "Verify classification: employee vs. independent contractor for tax treatment",
              "Employee compensation is subject to payroll tax withholding",
              "Contractor compensation is reported differently for tax purposes",
              "Keep detailed records of compensation by type and date",
              "Monthly reconciliation recommended to catch discrepancies early",
            ],
          };

          setReportData(data);
        }
      } catch (error) {
        console.error("Error loading agent compensation:", error);
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
