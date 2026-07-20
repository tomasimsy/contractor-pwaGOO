"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { getTaxSettings, updateTaxSettings, createTaxSettings } from "@/lib/queries/tax";
import type { TaxSettings } from "@/lib/queries/tax";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import { ArrowLeft, Save } from "lucide-react";
import toast from "react-hot-toast";

const ENTITY_TYPES = [
  { value: "sole_proprietorship", label: "Sole Proprietorship" },
  { value: "single_member_llc", label: "Single-Member LLC" },
  { value: "multi_member_llc", label: "Multi-Member LLC" },
  { value: "partnership", label: "Partnership" },
  { value: "s_corp", label: "S-Corp" },
  { value: "c_corp", label: "C-Corp" },
];

const ACCOUNTING_METHODS = [
  { value: "cash", label: "Cash Basis" },
  { value: "accrual", label: "Accrual Basis" },
];

const AGENT_CLASSIFICATIONS = [
  { value: "employee", label: "Employee (W2)" },
  { value: "independent_contractor", label: "Independent Contractor (1099)" },
];

const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

export default function TaxSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string>("");
  const [settings, setSettings] = useState<Partial<TaxSettings>>({
    entity_type: "sole_proprietorship",
    tax_year: new Date().getFullYear(),
    fiscal_year_start_month: 1,
    fiscal_year_end_month: 12,
    accounting_method: "cash",
    agent_classification: "independent_contractor",
    subcontractor_1099_threshold: 600,
    collect_sales_tax: false,
    sales_tax_rate: 0,
  });

  useEffect(() => {
    const init = async () => {
      try {
        const cid = await getCompanyId();
        if (cid) {
          setCompanyId(cid);
          const existingSettings = await getTaxSettings(cid);

          if (existingSettings) {
            setSettings(existingSettings);
          }
        }
      } catch (error) {
        console.error("Error loading tax settings:", error);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const handleSave = async () => {
    if (!companyId) return;

    setSaving(true);
    try {
      if (settings.id) {
        await updateTaxSettings(companyId, settings);
      } else {
        await createTaxSettings(companyId, settings);
      }

      toast.success("Tax settings saved successfully");
      router.push("/tax");
    } catch (error) {
      console.error("Error saving tax settings:", error);
      toast.error("Failed to save tax settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/60">
        <div className="text-center">
          <div className="text-slate-400">Loading tax settings...</div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <DesktopShell title="Tax Settings">
        <div className="min-h-screen bg-slate-50/50 md:bg-transparent">
          {/* Header */}
          <div className="border-b border-slate-200 bg-white px-6 py-4 md:px-0">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Tax Settings</h1>
                  <p className="text-sm text-slate-600">Configure your business tax information</p>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="mx-auto max-w-3xl px-4 py-6 md:px-0">
            <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              {/* Business Entity */}
              <div>
                <label className="block text-sm font-semibold text-slate-900">Business Entity Type</label>
                <select
                  value={settings.entity_type}
                  onChange={(e) => setSettings({ ...settings, entity_type: e.target.value as any })}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {ENTITY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tax Year */}
              <div>
                <label className="block text-sm font-semibold text-slate-900">Tax Year</label>
                <input
                  type="number"
                  value={settings.tax_year}
                  onChange={(e) => setSettings({ ...settings, tax_year: parseInt(e.target.value) })}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Fiscal Year */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-900">Fiscal Year Start Month</label>
                  <select
                    value={settings.fiscal_year_start_month}
                    onChange={(e) => setSettings({ ...settings, fiscal_year_start_month: parseInt(e.target.value) })}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                      const date = new Date(2024, month - 1);
                      return (
                        <option key={month} value={month}>
                          {date.toLocaleString("en-US", { month: "long" })}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900">Fiscal Year End Month</label>
                  <select
                    value={settings.fiscal_year_end_month}
                    onChange={(e) => setSettings({ ...settings, fiscal_year_end_month: parseInt(e.target.value) })}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                      const date = new Date(2024, month - 1);
                      return (
                        <option key={month} value={month}>
                          {date.toLocaleString("en-US", { month: "long" })}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Accounting Method */}
              <div>
                <label className="block text-sm font-semibold text-slate-900">Accounting Method</label>
                <select
                  value={settings.accounting_method}
                  onChange={(e) => setSettings({ ...settings, accounting_method: e.target.value as any })}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {ACCOUNTING_METHODS.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-600">
                  Cash basis reports income when received; accrual basis reports income when earned.
                </p>
              </div>

              {/* State */}
              <div>
                <label className="block text-sm font-semibold text-slate-900">State</label>
                <select
                  value={settings.state || ""}
                  onChange={(e) => setSettings({ ...settings, state: e.target.value })}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select state...</option>
                  {STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>

              {/* EIN */}
              <div>
                <label className="block text-sm font-semibold text-slate-900">EIN (Optional)</label>
                <input
                  type="text"
                  placeholder="XX-XXXXXXX"
                  value={settings.ein || ""}
                  onChange={(e) => setSettings({ ...settings, ein: e.target.value })}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Business Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-900">Business Name (Optional)</label>
                <input
                  type="text"
                  value={settings.business_name || ""}
                  onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Agent Classification */}
              <div>
                <label className="block text-sm font-semibold text-slate-900">Default Agent Classification</label>
                <select
                  value={settings.agent_classification}
                  onChange={(e) => setSettings({ ...settings, agent_classification: e.target.value as any })}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {AGENT_CLASSIFICATIONS.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 1099 Threshold */}
              <div>
                <label className="block text-sm font-semibold text-slate-900">
                  1099 Reporting Threshold
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-600">$</span>
                  <input
                    type="number"
                    value={settings.subcontractor_1099_threshold}
                    onChange={(e) => setSettings({ ...settings, subcontractor_1099_threshold: parseFloat(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  Report 1099-NEC for subcontractors paid this amount or more in a tax year.
                </p>
              </div>

              {/* Sales Tax */}
              <div className="border-t border-slate-200 pt-6">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.collect_sales_tax}
                    onChange={(e) => setSettings({ ...settings, collect_sales_tax: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm font-semibold text-slate-900">Collect Sales Tax</span>
                </label>

                {settings.collect_sales_tax && (
                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-slate-900">Sales Tax Rate</label>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        max="100"
                        value={settings.sales_tax_rate}
                        onChange={(e) => setSettings({ ...settings, sales_tax_rate: parseFloat(e.target.value) })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-slate-600">%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Save Button */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => router.back()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      </DesktopShell>
    </ProtectedRoute>
  );
}
