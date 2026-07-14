"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import Header from "@/components/ui/Header";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Building2,
  Users,
  Trash2,
  FileText,
  Receipt,
  Car,
  Percent,
  ScrollText,
  ChevronRight,
  Save,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Navigation menu data — grouped so the page reads as sections, not one
// long undifferentiated list of link cards.
// ---------------------------------------------------------------------------

const NAV_GROUPS: {
  label: string;
  items: { href: string; icon: any; title: string; subtitle?: string; tint: string }[];
}[] = [
  {
    label: "Records",
    items: [
      { href: "/estimates/completed", icon: FileText, title: "Completed Estimates", subtitle: "View all archived estimates", tint: "emerald" },
      { href: "/clients", icon: Users, title: "Clients", subtitle: "Manage client list", tint: "emerald" },
      { href: "/documents", icon: FileText, title: "Company Documents", subtitle: "Insurance, IRS, policies", tint: "indigo" },
      { href: "/settings/team", icon: Users, title: "Team", subtitle: "Manage teammates & invites", tint: "indigo" },
      { href: "/settings/subcontractors", icon: Users, title: "Subcontractors", subtitle: "Manage subcontractor list", tint: "amber" },
      { href: "/settings/agents", icon: Percent, title: "Agents", subtitle: "Manage sales agent list", tint: "amber" },
    ],
  },
  {
    label: "Money & Reporting",
    items: [
      { href: "/reports/expenses", icon: Receipt, title: "Reports", subtitle: "View account statements", tint: "emerald" },
      { href: "/statement", icon: Receipt, title: "Statements", subtitle: "View account statements", tint: "emerald" },
      { href: "/accounting", icon: FileText, title: "Accounting", subtitle: "Job costs & profitability", tint: "indigo" },
      { href: "/mileage", icon: Car, title: "Track Mileage", tint: "amber" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/deleted", icon: Trash2, title: "Trash", subtitle: "Restore or permanently delete", tint: "rose" },
    ],
  },
];

const TINTS: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600",
  indigo: "bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600",
  amber: "bg-amber-100 text-amber-700 group-hover:bg-amber-600",
  rose: "bg-rose-100 text-rose-600 group-hover:bg-rose-600",
};

// ---------------------------------------------------------------------------
// Small labeled field helper — same input styling, but with a visible label
// instead of relying on placeholder text alone.
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-300/30 transition"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

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
      setSettingsId(data.id);
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
    if (!settingsId) {
      toast.error("Couldn't find your settings record. Try reloading the page.");
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from("company_settings")
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settingsId);

    if (error) {
      toast.error("Error saving settings: " + error.message);
    } else {
      toast.success("Settings saved");
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/70 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm text-slate-500">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50/70 pb-28">
        <Header title="Settings" backLink="/" />

        <div className="mx-auto max-w-2xl space-y-5 p-4">
          <div>
            <div className="text-lg font-bold text-slate-800">Settings</div>
            <div className="text-sm text-slate-500">Manage your company, defaults, and records</div>
          </div>

          {/* NAVIGATION MENU */}
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                {group.label}
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm divide-y divide-slate-100">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex items-center justify-between p-3.5 transition hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition group-hover:text-white ${TINTS[item.tint]}`}
                        >
                          <Icon size={17} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-800 truncate">{item.title}</div>
                          {item.subtitle && (
                            <div className="text-xs text-slate-500 truncate">{item.subtitle}</div>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-slate-300 group-hover:text-slate-500 transition" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* COMPANY */}
          <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Building2 size={14} className="text-slate-400" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Company</span>
            </div>

            <div className="space-y-3">
              <Field
                label="Company name"
                value={settings.company_name}
                onChange={(v) => setSettings({ ...settings, company_name: v })}
                placeholder="One Square Roofing LLC"
              />

              <Field
                label="Address"
                value={settings.company_address}
                onChange={(v) => setSettings({ ...settings, company_address: v })}
                placeholder="Street, city, state, ZIP"
              />

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Phone"
                  value={settings.company_phone}
                  onChange={(v) => setSettings({ ...settings, company_phone: v })}
                  placeholder="(704) 303-4112"
                  type="tel"
                />
                <Field
                  label="Email"
                  value={settings.company_email}
                  onChange={(v) => setSettings({ ...settings, company_email: v })}
                  placeholder="hello@osrpros.com"
                  type="email"
                />
              </div>

              <Field
                label="Website"
                value={settings.company_website}
                onChange={(v) => setSettings({ ...settings, company_website: v })}
                placeholder="https://osrpros.com"
              />

              <Field
                label="Tax ID / EIN"
                value={settings.tax_id}
                onChange={(v) => setSettings({ ...settings, tax_id: v })}
                placeholder="XX-XXXXXXX"
              />
            </div>
          </div>

          {/* DEFAULTS */}
          <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Percent size={14} className="text-slate-400" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Defaults</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Deposit</span>
                <span className="font-semibold text-slate-800">{settings.default_deposit_percentage}%</span>
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
            <div className="mb-3 flex items-center gap-2">
              <ScrollText size={14} className="text-slate-400" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Terms</span>
            </div>

            <textarea
              value={settings.terms_conditions}
              onChange={(e) => setSettings({ ...settings, terms_conditions: e.target.value })}
              rows={5}
              placeholder="Terms & conditions..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-300/30 transition resize-none"
            />

            <div className="mt-2 text-[10px] text-slate-400">Shown on estimates &amp; invoices</div>
          </div>
        </div>

        {/* STICKY SAVE BAR */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/90 backdrop-blur-sm p-3">
          <div className="mx-auto max-w-2xl">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Save size={15} />
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}