"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/formatting";
import { CompanySettings, mergeCompanyDefaults } from "@/lib/company";

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

export default function PublicItemizedEstimatePage() {
  const { id } = useParams();
  const [estimate, setEstimate] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState(false);
  const [company, setCompany] = useState<CompanySettings>(mergeCompanyDefaults(null));

  useEffect(() => {
    loadItemizedData();
  }, [id]);

  async function loadItemizedData() {
    try {
      // Routed through the same SECURITY DEFINER bundle RPC the main public
      // estimate page uses — a direct anon table read here would return
      // nothing once RLS is enforced, and this also gives us company info.
      const { data: bundle } = await supabase.rpc("get_public_estimate_bundle", {
        p_estimate_id: id,
      });
      const est = bundle?.estimate;
      setEstimate(est);
      setSigned(!!est?.signature);
      setClient(bundle?.client || null);
      setCompany(mergeCompanyDefaults(bundle?.company));

      const items = bundle?.items || [];

      const projectMap: Record<string, Project> = {};
      items.forEach((item: any) => {
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
  const depositAmount = estimate?.deposit_amount || grandTotal * 0.5;
  const balanceDue = grandTotal - depositAmount;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center text-gray-500">Loading estimate details...</div>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-2">🔍</div>
          <h1 className="text-lg font-medium text-gray-700">Estimate Not Found</h1>
          <p className="text-gray-400 text-sm mt-2">This link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-10">
      {/* Header */}
      <div className="bg-green-700 text-white px-4 py-4">
<div className="max-w-4xl mx-auto">

  {/* BRAND */}
  <h1 className="text-lg font-semibold flex items-center gap-1">
    <span className="bg-orange-500 text-white px-2 py-0.5 rounded-md font-bold tracking-wide shadow-sm">
      OSR
    </span>

    <span className="text-white ml-1">
      Pros
    </span>
  </h1>

  {/* TAGLINE */}
  <p className="text-xs text-orange-200/90 mt-0.5 tracking-wide">
    Experienced • Insured • Built to Last
  </p>

  {/* INFO ROW */}
  <div className="flex justify-between items-end mt-3">

    {/* ESTIMATE */}
    <div>
      <div className="text-[11px] text-orange-200/80">
        Estimate
      </div>

      <div className="text-sm font-medium text-white">
        #{estimate?.estimate_number || id?.slice(0, 8)}
      </div>
    </div>

    {/* STATUS */}
    <div className="text-right">
      <div className="text-[11px] text-orange-200/80">
        Status
      </div>

      <div
        className={`text-sm font-medium ${
          signed ? "text-green-400" : "text-orange-300"
        }`}
      >
        {signed ? "✓ Signed" : "Pending"}
      </div>
    </div>

  </div>

</div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-5">
        {/* Customer Info */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-2">Customer</div>
          <div className="text-base font-semibold text-gray-800">{client?.name || "Valued Customer"}</div>
          {client?.phone && <div className="text-sm text-gray-500 mt-1">📞 {client.phone}</div>}
          {client?.email && <div className="text-sm text-gray-500">✉️ {client.email}</div>}
        </div>

        {/* Description */}
        {estimate?.description && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">Project Overview</div>
            <p className="text-sm text-gray-700">{estimate.description}</p>
          </div>
        )}

        {/* Projects - Itemized View */}
        <div className="space-y-5">
          {projects.map((project, idx) => (
            <div key={project.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Project Header */}
              <div className="bg-green-700 px-4 py-3">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-xs text-green-200">Project {idx + 1}</div>
                    <div className="text-base font-semibold text-white">{project.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-green-200">Total</div>
                    <div className="text-base font-bold text-white">{formatCurrency(project.total)}</div>
                  </div>
                </div>
              </div>

              {/* Project Description */}
              {project.description && (
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                  <p className="text-xs text-gray-600">{project.description}</p>
                </div>
              )}

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 w-8">#</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Item</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Qty</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Price</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.items.map((item, itemIdx) => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="px-4 py-2 text-xs text-gray-400">{itemIdx + 1}</td>
                        <td className="px-4 py-2">
                          <div className="text-sm font-medium text-gray-800">{item.name}</div>
                          {item.description && (
                            <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-sm text-gray-600">{item.quantity}</td>
                        <td className="px-4 py-2 text-right text-sm text-gray-600">
                          {formatCurrency(item.unit_price)}
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-medium text-gray-800">
                          {formatCurrency(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-green-50">
                      <td colSpan={4} className="px-4 py-2 text-right text-sm font-medium text-green-700">
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

        {/* Summary */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="text-xs text-gray-500 mb-3">Summary</div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-800">{formatCurrency(grandTotal)}</span>
            </div>
            
            <div className="border-t border-gray-100 my-2"></div>
            
            <div className="flex justify-between text-base font-semibold">
              <span>Total Estimate</span>
              <span className="text-green-700">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Deposit Info (if not signed) */}
        {!signed && depositAmount > 0 && (
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <div className="flex justify-between text-sm">
              <span className="text-amber-800">Deposit Required (50%)</span>
              <span className="font-semibold text-amber-900">{formatCurrency(depositAmount)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-amber-700">Balance Due</span>
              <span className="text-amber-800">{formatCurrency(balanceDue)}</span>
            </div>
          </div>
        )}

        {/* Signature Status */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-gray-500">Signature Status</div>
              <div className="text-sm font-medium mt-1">
                {signed ? (
                  <span className="text-green-600">✓ Signed and Approved</span>
                ) : (
                  <span className="text-amber-600">Awaiting Signature</span>
                )}
              </div>
            </div>
            {!signed && (
              <a
                href={`/public/estimates/${id}`}
                className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 transition"
              >
                Sign Estimate
              </a>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pt-4">
          <p>{company.company_name} • {company.company_address} • {company.company_phone}</p>
          <p className="mt-1">{company.company_email}</p>
        </div>
      </div>
    </div>
  );
}