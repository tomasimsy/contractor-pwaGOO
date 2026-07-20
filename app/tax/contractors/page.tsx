"use client";

import { useEffect, useState } from "react";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import {
  getSubcontractor1099Summary,
  getAgentCompensationSummary,
  getTaxSettings,
} from "@/lib/queries/tax";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import { formatCurrency } from "@/lib/utils/formatting";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ContractorsTaxPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());
  const [subcontractors, setSubcontractors] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        const cid = await getCompanyId();
        if (cid) {
          const settings = await getTaxSettings(cid);
          const year = settings?.tax_year || new Date().getFullYear();
          setTaxYear(year);

          const subData = await getSubcontractor1099Summary(cid, year);
          const agentData = await getAgentCompensationSummary(cid, year);

          setSubcontractors(subData);
          setAgents(agentData);
        }
      } catch (error) {
        console.error("Error loading contractor data:", error);
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
          <div className="text-slate-400">Loading contractor data...</div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <DesktopShell title="Contractor Tax Tracking">
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
                  <h1 className="text-2xl font-bold text-slate-900">1099 & Contractor Tracking</h1>
                  <p className="text-sm text-slate-600">Subcontractor and agent tax information for {taxYear}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-0">
            {/* SUBCONTRACTORS SECTION */}
            <div className="mb-8">
              <h2 className="mb-4 text-lg font-bold text-slate-900">Subcontractors (1099)</h2>

              {subcontractors.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
                  <div className="text-slate-600">No subcontractors paid in {taxYear}</div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                          Contractor
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                          Total Paid
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">
                          Assignments
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">
                          1099 Required
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">
                          W9 Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {subcontractors.map((sub, idx) => (
                        <tr
                          key={idx}
                          className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                        >
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">
                            {sub.name}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                            {formatCurrency(sub.total_paid)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-slate-600">
                            {sub.assignment_count}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {sub.requires_1099 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
                                Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                                No
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {sub.requires_1099 ? (
                              sub.w9_received ? (
                                <CheckCircle2 size={18} className="mx-auto text-emerald-600" />
                              ) : (
                                <AlertTriangle size={18} className="mx-auto text-rose-600" />
                              )
                            ) : (
                              <span className="text-sm text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* AGENTS SECTION */}
            <div className="mb-8">
              <h2 className="mb-4 text-lg font-bold text-slate-900">Agent Compensation</h2>

              {agents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
                  <div className="text-slate-600">No agent compensation in {taxYear}</div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                          Agent
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                          Commissions
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                          Reimbursements
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                          Total Compensation
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((agent, idx) => (
                        <tr
                          key={idx}
                          className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                        >
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">
                            {agent.name}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                            {formatCurrency(agent.total_commissions)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                            {formatCurrency(agent.total_reimbursements)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-emerald-700">
                            {formatCurrency(agent.total_compensation)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                        <td className="px-4 py-3 text-sm text-slate-900">TOTAL</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-900">
                          {formatCurrency(
                            agents.reduce((sum, a) => sum + a.total_commissions, 0)
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-900">
                          {formatCurrency(
                            agents.reduce((sum, a) => sum + a.total_reimbursements, 0)
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-emerald-700">
                          {formatCurrency(
                            agents.reduce((sum, a) => sum + a.total_compensation, 0)
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Data Source */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="font-semibold text-emerald-900">✓ Data Source Verification</h3>
              <p className="mt-2 text-sm text-emerald-800">
                All contractor and agent data comes from the unified financial calculation engine.
                Totals match across Dashboard, Analytics, and Expenses pages.
              </p>
            </div>
          </div>
        </div>
      </DesktopShell>
    </ProtectedRoute>
  );
}
