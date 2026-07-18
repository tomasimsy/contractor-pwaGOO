"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatting";
import DashboardPanel from "./desktop/DashboardPanel";

export default function ActiveProjects({
  projects,
}: {
  projects: Array<{
    id: string;
    name: string;
    clientName: string;
    revenue: number;
    expenses: number;
    profit: number;
    paymentPercent: number;
    status: "green" | "yellow" | "red";
  }>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (projects.length === 0) {
    return (
      <DashboardPanel title="Active Projects" accent="blue">
        <div className="text-[13px] text-gray-400">No projects found.</div>
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel title="Active Projects" accent="blue">
      {/* Mobile: Collapsible list */}
      <div className="md:hidden space-y-2">
        {projects.map((project) => (
          <div
            key={project.id}
            className="border border-gray-200 rounded-lg overflow-hidden bg-white"
          >
            {/* Header */}
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === project.id ? null : project.id)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50"
            >
              <div className="flex-1 text-left min-w-0">
                <div className="text-[13px] font-semibold text-gray-900">{project.name}</div>
                <div className="text-[12px] text-gray-600 mt-0.5">{project.clientName}</div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full shrink-0 ${
                    project.status === "red"
                      ? "bg-rose-600"
                      : project.status === "yellow"
                        ? "bg-amber-600"
                        : "bg-emerald-600"
                  }`}
                />
                {expandedId === project.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {/* Details - Expanded */}
            {expandedId === project.id && (
              <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] font-semibold text-gray-500 uppercase">Revenue</div>
                    <div className="text-[15px] font-bold text-gray-900 mt-1">
                      {formatCurrency(project.revenue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-gray-500 uppercase">Expenses</div>
                    <div className="text-[15px] font-bold text-gray-900 mt-1">
                      {formatCurrency(project.expenses)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-gray-500 uppercase">Profit</div>
                    <div
                      className={`text-[15px] font-bold mt-1 ${
                        project.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {formatCurrency(project.profit)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-gray-500 uppercase">Payment</div>
                    <div className="text-[15px] font-bold text-gray-900 mt-1">{project.paymentPercent}%</div>
                  </div>
                </div>

                <div className="border-t border-gray-300 pt-3">
                  <button
                    type="button"
                    className="text-[12px] font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    View Full Details
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tablet/Desktop: Grid layout */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project) => (
          <div
            key={project.id}
            className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gray-900 truncate">{project.name}</div>
                <div className="text-[12px] text-gray-600 truncate">{project.clientName}</div>
              </div>
              <div
                className={`w-3 h-3 rounded-full shrink-0 mt-1 ${
                  project.status === "red"
                    ? "bg-rose-600"
                    : project.status === "yellow"
                      ? "bg-amber-600"
                      : "bg-emerald-600"
                }`}
              />
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-gray-600">Revenue</span>
                <span className="text-[12px] font-semibold text-gray-900">{formatCurrency(project.revenue)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-gray-600">Expenses</span>
                <span className="text-[12px] font-semibold text-gray-900">{formatCurrency(project.expenses)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-gray-600">Profit</span>
                <span
                  className={`text-[12px] font-bold ${
                    project.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {formatCurrency(project.profit)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-gray-600">Payment</span>
                <span className="text-[12px] font-semibold text-gray-900">{project.paymentPercent}%</span>
              </div>
            </div>

            <button
              type="button"
              className="text-[12px] font-medium text-emerald-600 hover:text-emerald-700"
            >
              View Details
            </button>
          </div>
        ))}
      </div>
    </DashboardPanel>
  );
}
