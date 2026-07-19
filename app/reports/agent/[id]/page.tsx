"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { formatCurrency } from "@/lib/utils/formatting";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import Link from "next/link";

type PaymentRecord = {
  estimate_id: string;
  estimate_number: string;
  estimate_title: string | null;
  client_name: string;
  amount: number;
  payment_date: string;
};

export default function AgentDetail() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [agentName, setAgentName] = useState("");
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [totalAssigned, setTotalAssigned] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const companyId = await getCompanyId();
        if (!companyId) throw new Error("Company not found");

        // Get agent name
        const { data: agent, error: agentError } = await supabase
          .from("agents")
          .select("name")
          .eq("id", id)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .single();
        if (agentError) throw agentError;
        setAgentName(agent?.name || "Agent");

        // Get agent_payments
        const { data: paymentsData, error: payError } = await supabase
          .from("agent_payments")
          .select(`
            estimate_id,
            amount,
            created_at,
            estimates (
              estimate_number,
              title,
              client:client_id (name)
            )
          `)
          .eq("agent_id", id)
          .eq("company_id", companyId)
          .is("deleted_at", null);

        if (payError) throw payError;

        const records: PaymentRecord[] = (paymentsData || []).map(p => {
          const est = p.estimates as any;
          return {
            estimate_id: p.estimate_id,
            estimate_number: est?.estimate_number || "N/A",
            estimate_title: est?.title || null,
            client_name: est?.client?.name || "Unassigned",
            amount: p.amount || 0,
            payment_date: p.created_at || new Date().toISOString(),
          };
        });

        setPayments(records);
        const total = records.reduce((sum, r) => sum + r.amount, 0);
        setTotalPaid(total);

        // Assigned payout amounts, for a "still owed" summary — same
        // estimate_agents assignment table the Expense page's payout
        // workflow now assigns/edits against.
        const { data: assignments } = await supabase
          .from("estimate_agents")
          .select("amount")
          .eq("agent_id", id)
          .eq("company_id", companyId)
          .is("deleted_at", null);
        setTotalAssigned((assignments || []).reduce((sum, a: any) => sum + (a.amount || 0), 0));
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
          <button onClick={() => router.back()} className="text-amber-600 hover:underline">
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-slate-800">
            Agent: {agentName}
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Total Paid to this Agent</div>
            <div className="text-2xl font-bold text-amber-600">{formatCurrency(totalPaid)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Pending Payout</div>
            <div className="text-2xl font-bold text-rose-600">
              {formatCurrency(Math.max(totalAssigned - totalPaid, 0))}
            </div>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-500">
            No payments recorded for this agent.
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Estimate #</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Client</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Payment Date</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-slate-700">
                      <Link href={`/reports/expenses/${p.estimate_id}`} className="hover:text-emerald-600 hover:underline">
                        {p.estimate_number}
                      </Link>
                      {p.estimate_title && (
                        <div className="font-sans text-[10px] text-slate-400 truncate max-w-[160px]">{p.estimate_title}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">{p.client_name}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(p.payment_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-amber-600">
                      {formatCurrency(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50/80 border-t border-slate-300 font-semibold">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right">Total</td>
                  <td className="px-4 py-3 text-right font-mono text-amber-600">{formatCurrency(totalPaid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}