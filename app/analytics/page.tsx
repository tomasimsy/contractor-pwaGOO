"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  DollarSign,
  Percent,
  AlertCircle,
  Activity,
  Users,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import {
  getCompanyAnalytics,
  getProjectAnalytics,
  getClientAnalytics,
} from "@/lib/queries/analytics";
import type {
  CompanyFinancialAnalytics,
  ProjectAnalytics,
  ClientAnalytics,
} from "@/lib/queries/analytics";
import { formatCurrency } from "@/lib/utils/formatting";
import DesktopShell from "@/components/layout/DesktopShell";

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<CompanyFinancialAnalytics | null>(null);
  const [projects, setProjects] = useState<ProjectAnalytics[]>([]);
  const [clients, setClients] = useState<ClientAnalytics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const companyId = await getCompanyId();
        if (!companyId) throw new Error("Company not found");

        const now = new Date();
        const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

        const [analyticsData, projectsData, clientsData] = await Promise.all([
          getCompanyAnalytics(companyId, yearAgo, now),
          getProjectAnalytics(companyId),
          getClientAnalytics(companyId),
        ]);

        setAnalytics(analyticsData);
        setProjects(projectsData);
        setClients(clientsData);
      } catch (err: any) {
        console.error("Failed to load analytics:", err);
        setError(err?.message || "Failed to load analytics");
        toast.error("Failed to load analytics");
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalytics();
  }, []);

  const MetricCard = ({
    label,
    value,
    icon: Icon,
    color = "emerald",
  }: {
    label: string;
    value: string | number;
    icon: any;
    color?: string;
  }) => {
    const colorClasses: Record<string, string> = {
      emerald: "bg-emerald-100 text-emerald-700",
      amber: "bg-amber-100 text-amber-700",
      blue: "bg-blue-100 text-blue-700",
      rose: "bg-rose-100 text-rose-700",
    };

    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-slate-600 font-medium">{label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <DesktopShell>
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Activity className="w-5 h-5 text-emerald-700" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900">Financial Analytics</h1>
            </div>
            <p className="text-slate-600 ml-12">
              Unified financial reporting powered by shared calculation engine
            </p>
          </div>

          {isLoading && (
            <div className="text-center py-16 text-slate-500">
              <div className="animate-pulse">Loading analytics...</div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 mb-8 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold">Failed to load analytics</div>
                <div className="text-sm mt-1">{error}</div>
              </div>
            </div>
          )}

          {!isLoading && analytics && (
            <>
              {/* Financial Overview */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Financial Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <MetricCard
                    label="Total Revenue"
                    value={formatCurrency(analytics.totalRevenue)}
                    icon={DollarSign}
                    color="emerald"
                  />
                  <MetricCard
                    label="Payments Received"
                    value={formatCurrency(analytics.paymentsReceived)}
                    icon={TrendingUp}
                    color="emerald"
                  />
                  <MetricCard
                    label="Accounts Receivable"
                    value={formatCurrency(analytics.accountsReceivable)}
                    icon={FileText}
                    color="amber"
                  />
                  <MetricCard
                    label="Total Expenses"
                    value={formatCurrency(analytics.totalExpenses)}
                    icon={DollarSign}
                    color="rose"
                  />
                  <MetricCard
                    label="Subcontractor Costs"
                    value={formatCurrency(analytics.subcontractorCosts)}
                    icon={Users}
                    color="blue"
                  />
                  <MetricCard
                    label="Agent Costs"
                    value={formatCurrency(analytics.agentCosts)}
                    icon={Users}
                    color="blue"
                  />
                </div>
              </div>

              {/* Profitability Summary */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Profitability</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <MetricCard
                    label="Gross Profit"
                    value={formatCurrency(analytics.grossProfit)}
                    icon={TrendingUp}
                    color="emerald"
                  />
                  <MetricCard
                    label="Net Profit"
                    value={formatCurrency(analytics.netProfit)}
                    icon={TrendingUp}
                    color="emerald"
                  />
                  <MetricCard
                    label="Profit Margin"
                    value={`${analytics.profitMargin.toFixed(1)}%`}
                    icon={Percent}
                    color="emerald"
                  />
                </div>
              </div>

              {/* Invoice Summary */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Invoice Summary</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <MetricCard
                    label="Total Invoices"
                    value={analytics.totalInvoices}
                    icon={FileText}
                    color="blue"
                  />
                  <MetricCard
                    label="Paid"
                    value={analytics.paidInvoices}
                    icon={ArrowDownRight}
                    color="emerald"
                  />
                  <MetricCard
                    label="Pending"
                    value={analytics.pendingInvoices}
                    icon={FileText}
                    color="amber"
                  />
                  <MetricCard
                    label="Overdue"
                    value={analytics.overdueInvoices}
                    icon={AlertCircle}
                    color={analytics.overdueInvoices > 0 ? "rose" : "emerald"}
                  />
                </div>
              </div>

              {/* Projects & Clients Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Top Clients */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Top Clients by Profit
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {clients.slice(0, 5).map((client) => (
                      <div key={client.clientId} className="px-6 py-4 hover:bg-slate-50">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="font-medium text-slate-900">{client.clientName}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              {client.projectCount} project{client.projectCount !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-emerald-600">
                            {formatCurrency(client.totalProfit)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100">
                          <span>Revenue: {formatCurrency(client.totalRevenue)}</span>
                          <span>Margin: {client.profitMargin.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Most Profitable Projects */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Most Profitable Projects
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {projects.slice(0, 5).map((project) => (
                      <div key={project.estimateId} className="px-6 py-4 hover:bg-slate-50">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="font-medium text-slate-900">
                              {project.title || "Untitled"}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {project.clientName || "No Client"} • Est #{project.estimateNumber}
                            </p>
                          </div>
                          <span className={`text-sm font-bold ${
                            project.profit >= 0 ? "text-emerald-600" : "text-red-600"
                          }`}>
                            {formatCurrency(project.profit)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100">
                          <span>Revenue: {formatCurrency(project.revisedTotal)}</span>
                          <span>Margin: {project.profitMargin.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* All Projects Table */}
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="font-semibold text-slate-900">Project Profitability Details</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 text-left font-semibold text-slate-700">Project</th>
                        <th className="px-6 py-3 text-left font-semibold text-slate-700">Client</th>
                        <th className="px-6 py-3 text-right font-semibold text-slate-700">Contract</th>
                        <th className="px-6 py-3 text-right font-semibold text-slate-700">Collected</th>
                        <th className="px-6 py-3 text-right font-semibold text-slate-700">Costs</th>
                        <th className="px-6 py-3 text-right font-semibold text-slate-700">Profit</th>
                        <th className="px-6 py-3 text-right font-semibold text-slate-700">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {projects.map((project) => (
                        <tr key={project.estimateId} className="hover:bg-slate-50">
                          <td className="px-6 py-3">
                            <div className="font-medium text-slate-900">
                              {project.title || "Untitled"}
                            </div>
                            <div className="text-xs text-slate-500">Est #{project.estimateNumber}</div>
                          </td>
                          <td className="px-6 py-3 text-slate-600">
                            {project.clientName || "—"}
                          </td>
                          <td className="px-6 py-3 text-right font-medium text-slate-900">
                            {formatCurrency(project.revisedTotal)}
                          </td>
                          <td className="px-6 py-3 text-right font-medium text-slate-900">
                            {formatCurrency(project.amountCollected)}
                          </td>
                          <td className="px-6 py-3 text-right font-medium text-slate-900">
                            {formatCurrency(project.totalCosts)}
                          </td>
                          <td className={`px-6 py-3 text-right font-bold ${
                            project.profit >= 0 ? "text-emerald-600" : "text-red-600"
                          }`}>
                            {formatCurrency(project.profit)}
                          </td>
                          <td className="px-6 py-3 text-right text-slate-600">
                            {project.profitMargin.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </DesktopShell>
  );
}
