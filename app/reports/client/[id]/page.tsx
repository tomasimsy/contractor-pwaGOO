"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { formatCurrency } from "@/lib/utils/formatting";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import Link from "next/link";
import { calculateClientFinancials } from "@/lib/queries/financialCalculations";

type EstimateRecord = {
  estimate_id: string;
  estimate_number: string;
  title: string | null;
  total: number;
  status: string;
  created_at: string;
  payments_received: number;
};

function statusColor(status: string) {
  switch (status) {
    case "approved": return "bg-green-100 text-green-800";
    case "pending": return "bg-yellow-100 text-yellow-800";
    case "draft": return "bg-gray-100 text-gray-600";
    case "converted": return "bg-blue-100 text-blue-800";
    case "completed": return "bg-purple-100 text-purple-800";
    default: return "bg-gray-100 text-gray-600";
  }
}

export default function ClientDetail() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [clientName, setClientName] = useState("");
  const [estimates, setEstimates] = useState<EstimateRecord[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const companyId = await getCompanyId();
      if (!companyId) throw new Error("Company not found");

      // Get client name
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("name")
        .eq("id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .single();
      if (clientError) throw clientError;
      setClientName(client?.name || "Client");

      // Use unified engine for client financials
      const clientFinancials = await calculateClientFinancials(id, companyId);

      // Get all estimates for this client (for display)
      const { data: estimatesData, error: estError } = await supabase
        .from("estimates")
        .select(`
          id,
          estimate_number,
          title,
          total,
          status,
          created_at
        `)
        .eq("client_id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (estError) throw estError;

      const estimateIds = estimatesData?.map(e => e.id) || [];
      let invoiceData: any[] = [];
      if (estimateIds.length) {
        const { data: inv, error: invError } = await supabase
          .from("invoices")
          .select("estimate_id, amount_paid")
          .in("estimate_id", estimateIds)
          .eq("company_id", companyId)
          .in("status", ["paid", "partial"])
          .eq("is_deleted", false);
        if (!invError && inv) {
          invoiceData = inv;
        }
      }

      const paymentTotals: Record<string, number> = {};
      invoiceData.forEach(inv => {
        paymentTotals[inv.estimate_id] = (paymentTotals[inv.estimate_id] || 0) + (inv.amount_paid || 0);
      });

      const records: EstimateRecord[] = (estimatesData || []).map(e => ({
        estimate_id: e.id,
        estimate_number: e.estimate_number || "N/A",
        title: e.title || null,
        total: e.total || 0,
        status: e.status || "unknown",
        created_at: e.created_at || new Date().toISOString(),
        payments_received: paymentTotals[e.id] || 0,
      }));

      setEstimates(records);
      setTotalPaid(clientFinancials.totalPaid);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50/70 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.back()} className="text-emerald-600 hover:underline">
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-slate-800">
            Client: {clientName}
          </h1>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="text-sm text-slate-500">Total Payments Received from this Client</div>
          <div className="text-2xl font-bold text-emerald-600">{formatCurrency(totalPaid)}</div>
        </div>

        {estimates.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-500">
            No estimates found for this client.
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Estimate #</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Title</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Total Amount</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Payments Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {estimates.map((e) => (
                  <tr key={e.estimate_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-slate-700">
                      <Link href={`/reports/expenses/${e.estimate_id}`} className="hover:text-emerald-600 hover:underline">
                        {e.estimate_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-[200px]">
                      {e.title || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor(e.status)}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(e.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{formatCurrency(e.total)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatCurrency(e.payments_received)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50/80 border-t border-slate-300 font-semibold">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right">Total Payments</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatCurrency(totalPaid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}