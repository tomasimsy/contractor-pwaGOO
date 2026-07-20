"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getSubcontractor1099Summary, getTaxSettings } from "@/lib/queries/tax";
import { ReportViewer, type ReportData } from "../components/ReportViewer";
import { ArrowLeft } from "lucide-react";

export default function W9StatusReport() {
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
          const withW9 = taxableContractors.filter(s => s.w9_received);
          const withoutW9 = taxableContractors.filter(s => !s.w9_received);

          const data: ReportData = {
            title: "W9 Status Report",
            subtitle: "Contractor W9 documentation status for 1099 reporting",
            sections: [
              {
                title: "Contractors with W9 on File",
                items: withW9.map(sub => ({
                  label: sub.name,
                  value: sub.total_paid,
                  bold: true,
                })),
                subtotal: {
                  label: "Total with W9",
                  value: withW9.reduce((sum, s) => sum + s.total_paid, 0),
                },
              },
              {
                title: "Contractors Missing W9",
                items: withoutW9.map(sub => ({
                  label: sub.name,
                  value: sub.total_paid,
                  bold: false,
                })),
                subtotal: withoutW9.length > 0 ? {
                  label: "Total Missing W9",
                  value: withoutW9.reduce((sum, s) => sum + s.total_paid, 0),
                } : undefined,
              },
            ],
            notes: [
              "IRS Form W-9 must be on file before issuing 1099-NEC forms",
              "Request W9 forms immediately for any contractor with outstanding status",
              "W9 forms are valid indefinitely unless contractor info changes",
              "Keep W9 forms in secure records for at least 7 years",
              "Follow up with contractors at the beginning of each year to update W9 if needed",
            ],
          };

          setReportData(data);
        }
      } catch (error) {
        console.error("Error loading W9 status report:", error);
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
