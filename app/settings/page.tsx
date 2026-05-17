"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import Header from "@/components/ui/Header";

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
      <div className="min-h-screen bg-[#f6f7f9] flex items-center justify-center text-sm text-gray-500">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7f9] pb-24">
      <Header title="Settings" backLink="/" />

      <div className="mx-auto max-w-2xl space-y-3 p-4">

        {/* TITLE */}
        <div className="mb-2">
          <div className="text-lg font-semibold text-gray-900">Settings</div>
          <div className="text-sm text-gray-500">
            Manage your company and defaults
          </div>
        </div>

        {/* COMPANY */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">
            Company
          </div>

          <div className="space-y-3">

            <input
              value={settings.company_name}
              onChange={(e) =>
                setSettings({ ...settings, company_name: e.target.value })
              }
              placeholder="Company name"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />

            <input
              value={settings.company_address}
              onChange={(e) =>
                setSettings({ ...settings, company_address: e.target.value })
              }
              placeholder="Address"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />

            <div className="grid grid-cols-2 gap-2">

              <input
                value={settings.company_phone}
                onChange={(e) =>
                  setSettings({ ...settings, company_phone: e.target.value })
                }
                placeholder="Phone"
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none"
              />

              <input
                value={settings.company_email}
                onChange={(e) =>
                  setSettings({ ...settings, company_email: e.target.value })
                }
                placeholder="Email"
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none"
              />
            </div>

            <input
              value={settings.company_website}
              onChange={(e) =>
                setSettings({ ...settings, company_website: e.target.value })
              }
              placeholder="Website"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none"
            />

            <input
              value={settings.tax_id}
              onChange={(e) =>
                setSettings({ ...settings, tax_id: e.target.value })
              }
              placeholder="Tax ID / EIN"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        {/* DEFAULTS */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">
            Defaults
          </div>

          <div className="space-y-2">

            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Deposit</span>
              <span className="text-gray-900 font-medium">
                {settings.default_deposit_percentage}%
              </span>
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
              className="w-full"
            />

            <div className="text-xs text-gray-400">
              Default deposit for new estimates
            </div>
          </div>
        </div>

        {/* TERMS */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">
            Terms
          </div>

          <textarea
            value={settings.terms_conditions}
            onChange={(e) =>
              setSettings({ ...settings, terms_conditions: e.target.value })
            }
            rows={6}
            placeholder="Terms & conditions..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400"
          />

          <div className="mt-2 text-xs text-gray-400">
            Shown on estimates & invoices
          </div>
        </div>

        {/* SAVE */}
        <button
          onClick={saveSettings}
          disabled={saving}
          className="w-full rounded-2xl bg-gray-900 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-black disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}