"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import Header from "@/components/ui/Header";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Link from "next/link";

type LineItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

type Project = {
  id: string;
  name: string;
  description: string;
  items: LineItem[];
  total: number;
};

export default function ItemizedEstimatePage() {
  const { id } = useParams();
  const router = useRouter();
  const [estimate, setEstimate] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadItemizedData();
  }, [id]);

  async function loadItemizedData() {
    try {
      // Load estimate
      const { data: est } = await supabase
        .from("estimates")
        .select("*")
        .eq("id", id)
        .single();
      setEstimate(est);

      // Load client
      if (est?.client_id) {
        const { data: c } = await supabase
          .from("clients")
          .select("*")
          .eq("id", est.client_id)
          .single();
        setClient(c);
      }

      // Load items
      const { data: items } = await supabase
        .from("estimate_items")
        .select("*")
        .eq("estimate_id", id)
        .is("deleted_at", null);

      // Group by project
      const projectMap: Record<string, Project> = {};
      items?.forEach((item) => {
        const projectName = item.project_name || "Main Project";
        if (!projectMap[projectName]) {
          projectMap[projectName] = {
            id: crypto.randomUUID(),
            name: projectName,
            description: item.project_description || "",
            items: [],
            total: 0,
          };
        }
        projectMap[projectName].items.push({
          id: item.id,
          category: item.category,
          name: item.name,
          description: item.description || "",
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
        });
        projectMap[projectName].total += item.total;
      });

      setProjects(Object.values(projectMap));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const grandTotal = projects.reduce((sum, p) => sum + p.total, 0);

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center text-gray-500">Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100 pb-20">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => router.back()} className="text-gray-600 text-xl">
              ←
            </button>
            <h1 className="text-base font-semibold text-gray-800">Itemized Estimate</h1>
            <Link href={`/estimates/${id}`}>
              <button className="text-green-600 text-sm">Back</button>
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-4 space-y-6">
          {/* Header Info */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-gray-500 mb-1">Estimate</div>
                <div className="text-lg font-semibold text-gray-800">
                  #{estimate?.estimate_number || id?.slice(0, 8)}
                </div>
                <div className="text-sm text-gray-600 mt-1">{client?.name}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Grand Total</div>
                <div className="text-xl font-bold text-green-700">{formatCurrency(grandTotal)}</div>
              </div>
            </div>
          </div>

          {/* Projects Section */}
          <div className="space-y-6">
            {projects.map((project, idx) => (
              <div key={project.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Project Header */}
                <div className="bg-green-700 px-4 py-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-xs text-green-200">Project {idx + 1}</div>
                      <div className="text-lg font-semibold text-white">{project.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-green-200">Project Total</div>
                      <div className="text-lg font-bold text-white">{formatCurrency(project.total)}</div>
                    </div>
                  </div>
                </div>

                {/* Project Description */}
                {project.description && (
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                    <div className="text-xs text-gray-500">Project Description</div>
                    <div className="text-sm text-gray-700 mt-1">{project.description}</div>
                  </div>
                )}

                {/* Items Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-8">#</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Item</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Category</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Qty</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Price</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.items.map((item, itemIdx) => (
                        <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                          <td className="px-4 py-3 text-sm text-gray-400">{itemIdx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-800">{item.name}</div>
                            {item.description && (
                              <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              item.category === "Material" ? "bg-blue-100 text-blue-700" :
                              item.category === "Labor" ? "bg-green-100 text-green-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>
                              {item.category}
                            </span>
                           </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">
                            {formatCurrency(item.unit_price)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-gray-800">
                            {formatCurrency(item.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-green-50">
                        <td colSpan={5} className="px-4 py-2 text-right text-sm font-medium text-green-700">
                          Project Total
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-bold text-green-800">
                          {formatCurrency(project.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Footer */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs text-gray-500">Total Items</div>
                <div className="text-sm font-medium text-gray-700">
                  {projects.reduce((sum, p) => sum + p.items.length, 0)} items across {projects.length} projects
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Grand Total</div>
                <div className="text-xl font-bold text-green-700">{formatCurrency(grandTotal)}</div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => window.print()}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition"
            >
              🖨️ Print
            </button>
            <Link href={`/estimates/${id}`} className="flex-1">
              <button className="w-full py-2 rounded-lg bg-green-700 text-white text-sm hover:bg-green-800 transition">
                Back to Estimate
              </button>
            </Link>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}