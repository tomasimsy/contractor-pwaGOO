"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, DollarSign, Percent } from "lucide-react";
import toast from "react-hot-toast";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getProfitabilityMetrics, getCompanyProfitability, getClientProfitability } from "@/lib/queries/analytics";
import type { ProfitabilityMetrics, ProjectProfitability, ClientProfitability } from "@/lib/queries/analytics";
import { formatCurrency } from "@/lib/utils/formatting";
import DesktopShell from "@/components/layout/DesktopShell";

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<ProfitabilityMetrics | null>(null);
  const [projects, setProjects] = useState<ProjectProfitability[]>([]);
  const [clients, setClients] = useState<ClientProfitability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const companyId = await getCompanyId();
        if (!companyId) throw new Error("Company not found");

        const [metricsData, projectsData, clientsData] = await Promise.all([
          getProfitabilityMetrics(companyId),
          getCompanyProfitability(companyId),
          getClientProfitability(companyId),
        ]);

        setMetrics(metricsData);
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

  return (
    <DesktopShell>
      <div className="min-h-screen bg-gray-50/60">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/expense"
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft size={16} />
              Back to Expenses
            </Link>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">Profitability Analytics</h1>
          <p className="text-gray-600 mb-8">Track revenue, costs, and profit across your projects</p>

          {isLoading && (
            <div className="text-center py-12 text-gray-500">Loading analytics...</div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 mb-8">
              {error}
            </div>
          )}

          {!isLoading && metrics && (
            <>
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Total Revenue</p>
                      <p className="text-2xl font-bold text-gray-900 mt-2">
                        {formatCurrency(metrics.totalRevenue)}
                      </p>
                    </div>
                    <DollarSign className="w-8 h-8 text-emerald-500 opacity-20" />
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Total Costs</p>
                      <p className="text-2xl font-bold text-gray-900 mt-2">
                        {formatCurrency(metrics.totalExpenses)}
                      </p>
                    </div>
                    <DollarSign className="w-8 h-8 text-red-500 opacity-20" />
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Total Profit</p>
                      <p className="text-2xl font-bold text-gray-900 mt-2">
                        {formatCurrency(metrics.totalProfit)}
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-blue-500 opacity-20" />
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Avg Profit Margin</p>
                      <p className="text-2xl font-bold text-gray-900 mt-2">
                        {metrics.avgMarginPercent.toFixed(1)}%
                      </p>
                    </div>
                    <Percent className="w-8 h-8 text-purple-500 opacity-20" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Top Profitable Projects */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Most Profitable Projects</h2>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {projects.slice(0, 5).map((project) => (
                      <div key={project.estimateId} className="px-6 py-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium text-gray-900">
                              {project.projectTitle || "Untitled"}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {project.clientName || "No Client"} • Est #{project.estimateNumber}
                            </p>
                          </div>
                          <span className={`text-sm font-bold ${
                            project.profit >= 0 ? "text-emerald-600" : "text-red-600"
                          }`}>
                            {formatCurrency(project.profit)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          <span>Revenue: {formatCurrency(project.revenue)}</span>
                          <span>Costs: {formatCurrency(project.expenses)}</span>
                          <span>Margin: {project.marginPercent.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Clients by Revenue */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Top Clients by Revenue</h2>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {clients.slice(0, 5).map((client) => (
                      <div key={client.clientId} className="px-6 py-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium text-gray-900">{client.clientName}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {client.projectCount} project{client.projectCount !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-gray-900">
                            {formatCurrency(client.totalRevenue)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          <span>Profit: {formatCurrency(client.totalProfit)}</span>
                          <span>Margin: {client.avgMarginPercent.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* All Projects Table */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">All Projects</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left font-semibold text-gray-900">Project</th>
                        <th className="px-6 py-3 text-left font-semibold text-gray-900">Client</th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-900">Revenue</th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-900">Costs</th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-900">Profit</th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-900">Margin %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {projects.map((project) => (
                        <tr key={project.estimateId} className="hover:bg-gray-50">
                          <td className="px-6 py-3">
                            <div className="font-medium text-gray-900">
                              {project.projectTitle || "Untitled"}
                            </div>
                            <div className="text-xs text-gray-500">Est #{project.estimateNumber}</div>
                          </td>
                          <td className="px-6 py-3 text-gray-700">
                            {project.clientName || "No Client"}
                          </td>
                          <td className="px-6 py-3 text-right text-gray-900 font-medium">
                            {formatCurrency(project.revenue)}
                          </td>
                          <td className="px-6 py-3 text-right text-gray-900 font-medium">
                            {formatCurrency(project.expenses)}
                          </td>
                          <td className={`px-6 py-3 text-right font-bold ${
                            project.profit >= 0 ? "text-emerald-600" : "text-red-600"
                          }`}>
                            {formatCurrency(project.profit)}
                          </td>
                          <td className={`px-6 py-3 text-right font-bold ${
                            project.marginPercent >= 20 ? "text-emerald-600" :
                            project.marginPercent >= 0 ? "text-amber-600" :
                            "text-red-600"
                          }`}>
                            {project.marginPercent.toFixed(1)}%
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
