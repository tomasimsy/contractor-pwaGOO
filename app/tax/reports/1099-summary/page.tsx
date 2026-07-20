"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getSubcontractor1099Summary, getTaxSettings } from "@/lib/queries/tax";
import { ReportViewer, type ReportData } from "../components/ReportViewer";
import { ArrowLeft } from "lucide-react";

export default function One099SummaryReport() {
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

          const subData = await getSubcontractor1099Summary(cid, year);

          // Filter only contractors that require 1099
          const taxableContractors = subData.filter(s => s.requires_1099);

          const data: ReportData = {
            title: "1099 Payment Summary",
            subtitle: "Subcontractor payments subject to 1099 reporting",
            sections: [
              {
                title: "1099-Eligible Contractor Payments",
                items: taxableContractors.map(sub => ({
                  label: sub.name,
                  value: sub.total_paid,
                  bold: false,
                })),
                subtotal: {
                  label: "Total 1099 Reportable Payments",
                  value: taxableContractors.reduce((sum, s) => sum + s.total_paid, 0),
                },
              },
              {
                title: "1099 Reporting Status",
                items: taxableContractors.map(sub => ({
                  label: `${sub.name} - W9 Received`,
                  value: sub.w9_received ? 1 : 0,
                  bold: false,
                })),
              },
            ],
            notes: [
              "1099 forms must be issued to all contractors paid $600 or more in a calendar year",
              "Ensure W9 forms are on file before issuing 1099-NEC forms",
              "1099 forms are typically issued by January 31st of the following year",
              "Keep detailed records of all contractor payments with dates and descriptions",
              "Contractors with W9 status marked as received are ready for 1099 reporting",
            ],
          };

          setReportData(data);
        }
      } catch (error) {
        console.error("Error loading 1099 summary:", error);
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
