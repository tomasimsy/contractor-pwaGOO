"use client";

import { useEffect, useState } from "react";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getTaxDashboard, getTaxSettings } from "@/lib/queries/tax";
import type { TaxDashboardData } from "@/lib/queries/tax";
import { formatCurrency } from "@/lib/utils/formatting";
import { Download } from "lucide-react";

export default function ProfitLossReport() {
  const [loading, setLoading] = useState(true);
  const [taxData, setTaxData] = useState<TaxDashboardData | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const cid = await getCompanyId();
        if (cid) {
          const settings = await getTaxSettings(cid);
          const taxYear = settings?.tax_year || new Date().getFullYear();
          const startMonth = settings?.fiscal_year_start_month || 1;
          const endMonth = settings?.fiscal_year_end_month || 12;

          const startDate = new Date(taxYear, startMonth - 1, 1);
          const endDate = new Date(taxYear, endMonth, 0);

          const data = await getTaxDashboard(cid, startDate, endDate);
          setTaxData(data);
        }
      } catch (error) {
        console.error("Error loading profit & loss data:", error);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading Profit & Loss Statement...</div>;
  }

  if (!taxData?.financials) {
    return <div className="p-8 text-center text-slate-400">No financial data available</div>;
  }

  const financials = taxData.financials;
  const taxYear = taxData.taxSettings?.tax_year || new Date().getFullYear();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Profit & Loss Statement</h1>
              <p className="text-sm text-slate-600 mt-1">For the Year Ended December 31, {taxYear}</p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800">
              <Download size={16} />
              Download PDF
            </button>
          </div>

          {taxData.taxSettings && (
            <div className="text-sm text-slate-600">
              <p>{taxData.taxSettings.business_name || "Business"}</p>
              <p>Entity Type: {taxData.taxSettings.entity_type.replace(/_/g, " ").toUpperCase()}</p>
              <p>Accounting Method: {taxData.taxSettings.accounting_method.toUpperCase()}</p>
            </div>
          )}
        </div>
      </div>

      {/* Statement */}
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <table className="w-full">
            <tbody>
              {/* Revenue Section */}
              <tr className="border-b-2 border-slate-300">
                <td className="py-3 font-bold text-slate-900">INCOME</td>
                <td className="text-right"></td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="py-2 pl-6 text-slate-700">Service Revenue</td>
                <td className="text-right text-slate-900">{formatCurrency(financials.totalRevenue)}</td>
              </tr>
              <tr className="bg-slate-50 font-semibold">
                <td className="py-2 text-slate-900">Total Revenue</td>
                <td className="text-right text-slate-900">{formatCurrency(financials.totalRevenue)}</td>
              </tr>

              {/* Expenses Section */}
              <tr className="border-b-2 border-slate-300 pt-6">
                <td className="py-4 font-bold text-slate-900">COST OF GOODS SOLD & OPERATING EXPENSES</td>
                <td className="text-right"></td>
              </tr>

              <tr className="border-b border-slate-200">
                <td className="py-2 pl-6 text-slate-700">Materials & Supplies</td>
                <td className="text-right text-slate-900">{formatCurrency(financials.expenseItems)}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="py-2 pl-6 text-slate-700">Subcontractor Costs</td>
                <td className="text-right text-slate-900">{formatCurrency(financials.subcontractorPaid)}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="py-2 pl-6 text-slate-700">Agent Commissions & Wages</td>
                <td className="text-right text-slate-900">{formatCurrency(financials.agentPaid)}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="py-2 pl-6 text-slate-700">Vehicle & Mileage Expenses</td>
                <td className="text-right text-slate-900">{formatCurrency(financials.mileageCosts)}</td>
              </tr>

              <tr className="bg-slate-50 font-semibold">
                <td className="py-2 text-slate-900">Total Operating Expenses</td>
                <td className="text-right text-slate-900">{formatCurrency(financials.totalExpenses)}</td>
              </tr>

              {/* Profit Section */}
              <tr className="border-t-2 border-slate-300 bg-emerald-50">
                <td className="py-3 font-bold text-emerald-900">GROSS PROFIT</td>
                <td className="text-right font-bold text-emerald-900">
                  {formatCurrency(financials.totalRevenue - financials.totalExpenses)}
                </td>
              </tr>

              <tr className="border-t-2 border-slate-300 bg-emerald-100">
                <td className="py-3 font-bold text-emerald-900">NET PROFIT (LOSS)</td>
                <td className="text-right font-bold text-emerald-900">{formatCurrency(financials.netProfit)}</td>
              </tr>
            </tbody>
          </table>

          {/* Notes */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <h3 className="font-bold text-slate-900 mb-3">Notes:</h3>
            <ul className="text-sm text-slate-600 space-y-2">
              <li>• Revenue includes base estimates and approved change orders</li>
              <li>• Expenses include all categorized business expenses</li>
              <li>• Subcontractor costs reflect amounts paid to 1099 contractors</li>
              <li>• Agent costs include commissions and reimbursements</li>
              <li>• All figures based on reconciled financial records</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
