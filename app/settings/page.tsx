"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import Header from "@/components/ui/Header";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Link from "next/link";
import { Settings2, Building2, Users, Trash2, FileText, Receipt, Car } from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    company_name: "",
    company_address: "",
    company_phone: "",
    company_email: "",
    company_website: "",
    tax_id: "",
    default_deposit_percentage: 50,
    terms_conditions: "",
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const { data } = await supabase.from("company_settings").select("*").single();

    if (data) {
      setSettings({
        company_name: data.company_name || "",
        company_address: data.company_address || "",
        company_phone: data.company_phone || "",
        company_email: data.company_email || "",
        company_website: data.company_website || "",
        tax_id: data.tax_id || "",
        default_deposit_percentage: data.default_deposit_percentage || 50,
        terms_conditions: data.terms_conditions || "",
      });
    }

    setLoading(false);
  }

  async function saveSettings() {
    setSaving(true);

    const { data } = await supabase.from("company_settings").select("id").single();

    const { error } = await supabase
      .from("company_settings")
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data?.id);

    if (error) {
      alert(error.message);
    } else {
      alert("Settings saved");
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/70 flex items-center justify-center text-sm text-slate-500">
        Loading settings...
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50/70 pb-24">
        <Header title="Settings" backLink="/" />

        <div className="mx-auto max-w-2xl space-y-4 p-4">

          {/* TITLE */}
          <div className="mb-2">
            <div className="text-lg font-bold text-slate-800">Settings</div>
            <div className="text-sm text-slate-500">Manage your company and defaults</div>
          </div>

          {/* EXTERNAL SETTINGS */}
          <Link
            href="/estimates/completed"
            target=""
            className="group flex items-center justify-between rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition">
                <FileText size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Completed Estimates</div>
                <div className="text-xs text-slate-500">View all archived estimates</div>
              </div>
            </div>
            <div className="text-xs font-medium text-slate-400 group-hover:text-slate-700 transition">Open →</div>
          </Link>

          <Link
            href="/reports/expenses"
            target=""
            className="group flex items-center justify-between rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition">
                <Receipt size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Reports Details</div>
                <div className="text-xs text-slate-500">View account statements</div>
              </div>
            </div>
            <div className="text-xs font-medium text-slate-400 group-hover:text-slate-700 transition">Open →</div>
          </Link>

          <Link
            href="/statement/"
            target=""
            className="group flex items-center justify-between rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition">
                <Receipt size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Statement Details</div>
                <div className="text-xs text-slate-500">View account statements</div>
              </div>
            </div>
            <div className="text-xs font-medium text-slate-400 group-hover:text-slate-700 transition">Open →</div>
          </Link>

          <Link
            href="/clients/"
            target=""
            className="group flex items-center justify-between rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition">
                <Users size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Clients</div>
                <div className="text-xs text-slate-500">Manage client list</div>
              </div>
            </div>
            <div className="text-xs font-medium text-slate-400 group-hover:text-slate-700 transition">Open →</div>
          </Link>



          <Link
            href="/mileage/"
            target=""
            className="group flex items-center justify-between rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-100 text-gold-700 group-hover:bg-gold-600 group-hover:text-emerald-800 transition">
                <Car size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Track Mileage</div>
                {/* <div className="text-xs text-slate-500">Manage client list</div> */}
              </div>
            </div>
            {/* <div className="text-xs font-medium text-slate-400 group-hover:text-slate-700 transition">Open →</div> */}
          </Link>

          <Link
  href="/documents"
  className="group flex items-center justify-between rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
>
  <div className="flex items-center gap-3">
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition">
      <FileText size={18} />
    </div>
    <div>
      <div className="text-sm font-semibold text-slate-800">Company Documents</div>
      <div className="text-xs text-slate-500">Insurance, IRS, policies</div>
    </div>
  </div>
  <div className="text-xs font-medium text-slate-400 group-hover:text-slate-700 transition">Open →</div>
</Link>

          {/* Trash */}
          <Link
            href="/deleted"
            target=""
            className="group flex items-center justify-between rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition">
                <Trash2 size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Trash</div>
                <div className="text-xs text-slate-500">Restore or permanently delete</div>
              </div>
            </div>
            <div className="text-xs font-medium text-slate-400 group-hover:text-slate-700 transition">Open →</div>
          </Link>


          {/* COMPANY */}
          <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <div className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Company</div>

            <div className="space-y-2.5">
              <input
                value={settings.company_name}
                onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                placeholder="Company name"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-300/30 transition"
              />

              <input
                value={settings.company_address}
                onChange={(e) => setSettings({ ...settings, company_address: e.target.value })}
                placeholder="Address"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-300/30 transition"
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  value={settings.company_phone}
                  onChange={(e) => setSettings({ ...settings, company_phone: e.target.value })}
                  placeholder="Phone"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-300/30 transition"
                />
                <input
                  value={settings.company_email}
                  onChange={(e) => setSettings({ ...settings, company_email: e.target.value })}
                  placeholder="Email"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-300/30 transition"
                />
              </div>

              <input
                value={settings.company_website}
                onChange={(e) => setSettings({ ...settings, company_website: e.target.value })}
                placeholder="Website"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-300/30 transition"
              />

              <input
                value={settings.tax_id}
                onChange={(e) => setSettings({ ...settings, tax_id: e.target.value })}
                placeholder="Tax ID / EIN"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-300/30 transition"
              />
            </div>
          </div>

          {/* DEFAULTS */}
          <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <div className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Defaults</div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Deposit</span>
                <span className="font-medium text-slate-800">{settings.default_deposit_percentage}%</span>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={settings.default_deposit_percentage}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_deposit_percentage: Number(e.target.value),
                  })
                }
                className="w-full accent-emerald-600"
              />

              <div className="text-[10px] text-slate-400">Default deposit for new estimates</div>
            </div>
          </div>

          {/* TERMS */}
          <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <div className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Terms</div>

            <textarea
              value={settings.terms_conditions}
              onChange={(e) => setSettings({ ...settings, terms_conditions: e.target.value })}
              rows={5}
              placeholder="Terms & conditions..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-300/30 transition resize-none"
            />

            <div className="mt-2 text-[10px] text-slate-400">Shown on estimates & invoices</div>
          </div>

          {/* SAVE */}
          <button
            onClick={saveSettings}
            disabled={saving}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </ProtectedRoute>
  );
}