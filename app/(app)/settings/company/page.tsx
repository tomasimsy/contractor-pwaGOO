"use client";

/**
 * Company Settings — the single UI that WRITES to `company_settings`,
 * the exact same table every PDF route (app/api/invoices/[id]/pdf,
 * app/api/estimates/[id]/pdf), the public portal page
 * (app/portal/[id]), and the public invoice page (app/invoice/[id])
 * already READ via lib/company.ts's getCompanySettingsByCompanyId.
 * CompanyService (lib/services/companyService.ts) is a thin wrapper
 * around those same functions — there is exactly one merge-with-
 * defaults rule and one write path, here.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, FolderLock, Mail, Upload } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { usePermission } from "@/lib/hooks/usePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { DEFAULT_COMPANY_SETTINGS } from "@/lib/company";
import { ESTIMATE_TERMS_TEMPLATES } from "@/lib/estimateTerms";
import type { CompanySettings } from "@/lib/services/companyService";

type FormState = CompanySettings;

/** DEFAULT_COMPANY_SETTINGS's company_name/phone/email/address are
 * deliberately human-readable placeholder TEXT ("Add your email"),
 * meant to keep a PDF/invoice from rendering blank for a company that
 * hasn't configured them yet — mergeCompanyDefaults (lib/company.ts)
 * substitutes them in for exactly that reason. But this form must
 * treat an unconfigured field as genuinely EMPTY, not pre-filled with
 * that sentence: loading it as the literal value meant the email
 * field silently failed this page's own "is this a valid email"
 * validation on every save for any company that hadn't set one yet —
 * found live: "Failed to save" with the actual reason (an invalid
 * email) scrolled off-screen, no visible link between the two. */
function blankKnownPlaceholders(settings: CompanySettings): CompanySettings {
  const next = { ...settings };
  if (next.company_name === DEFAULT_COMPANY_SETTINGS.company_name) next.company_name = "";
  if (next.company_phone === DEFAULT_COMPANY_SETTINGS.company_phone) next.company_phone = "";
  if (next.company_email === DEFAULT_COMPANY_SETTINGS.company_email) next.company_email = "";
  if (next.company_address === DEFAULT_COMPANY_SETTINGS.company_address) next.company_address = "";
  return next;
}

const FIELD_LABEL: Record<string, string> = {
  company_name: "Company Name",
  dba: "Legal Name / DBA",
  business_type: "Business Type",
  company_phone: "Phone",
  company_email: "Email",
  bcc_email: "BCC Email",
  review_link: "Review Link",
  company_website: "Website",
  company_website_2: "Second Website",
  company_address: "Address",
  city: "City",
  state: "State",
  zip: "ZIP",
  country: "Country",
  tax_id: "EIN",
  license_number: "License Number",
  insurance_policy: "Insurance Policy",
  brand_color: "Brand Color",
};

function Field({
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  className,
}: {
  name: keyof FormState;
  value: string;
  onChange: (name: keyof FormState, value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-foreground">{FIELD_LABEL[name] ?? name}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      />
    </div>
  );
}

function CompanySettingsContent() {
  const { companyService } = useServices();
  const { profile } = useAuth();
  const canUpdate = usePermission("company_settings", "update");

  const [initial, setInitial] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const companyId = profile?.companyId ?? null;

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const settings = blankKnownPlaceholders(await companyService.getByCompanyId(companyId));
      setInitial(settings);
      setForm(settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load company settings.");
    } finally {
      setLoading(false);
    }
  }, [companyService, companyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!initial || !form) return false;
    return JSON.stringify(initial) !== JSON.stringify(form);
  }, [initial, form]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty) e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function setField(name: keyof FormState, value: string) {
    setForm((prev) => (prev ? { ...prev, [name]: value } : prev));
    setSaved(false);
  }

  function validate(f: FormState): Record<string, string> {
    const issues: Record<string, string> = {};
    if (!f.company_name.trim()) issues.company_name = "Company name is required.";
    if (f.company_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.company_email)) issues.company_email = "Enter a valid email address.";
    if (f.bcc_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.bcc_email)) issues.bcc_email = "Enter a valid email address.";
    if (f.brand_color && f.brand_color.trim() && !/^#[0-9a-fA-F]{3,8}$/.test(f.brand_color.trim())) {
      issues.brand_color = "Enter a hex color, e.g. #1E40AF.";
    }
    return issues;
  }

  async function handleSave() {
    if (!companyId || !form) return;
    const issues = validate(form);
    setFieldErrors(issues);
    if (Object.keys(issues).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await companyService.update(companyId, form);
      setInitial(updated);
      setForm(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save company settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    if (!companyId) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", "logo");
      const res = await fetch("/api/company-documents/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to upload logo.");
      const logoUrl = `/api/company-documents/download?path=${encodeURIComponent(json.storagePath)}`;
      const updated = await companyService.update(companyId, { logo_url: logoUrl });
      setInitial(updated);
      setForm(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  if (loading || !form) {
    return (
      <PageContainer>
        <PageHeader title="Company Settings" description="This information appears on every invoice, estimate, PDF, and customer-facing page." />
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Company Settings"
        description="This information appears on every invoice, estimate, PDF, and customer-facing page."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/settings/company/profiles" className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              <Building2 className="size-3.5" /> Business Profiles
            </Link>
            <Link href="/settings/company/email-automations" className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              <Mail className="size-3.5" /> Email Automations
            </Link>
            <Link href="/settings/company/documents" className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
              <FolderLock className="size-3.5" /> Company Documents
            </Link>
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {!canUpdate && (
        <div className="mb-4 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
          You have view-only access — ask an admin to make changes here.
        </div>
      )}
      {dirty && canUpdate && (
        <div className="mb-4 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">You have unsaved changes.</div>
      )}
      {saved && !dirty && (
        <div className="mb-4 rounded-lg bg-success/15 px-3 py-2 text-sm text-success-foreground">Saved.</div>
      )}

      <fieldset disabled={!canUpdate || saving} className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Identity</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Field name="company_name" value={form.company_name} onChange={setField} />
              {fieldErrors.company_name && <p className="mt-1 text-xs text-danger">{fieldErrors.company_name}</p>}
            </div>
            <Field name="dba" value={form.dba ?? ""} onChange={setField} placeholder="If different from company name" />
            <Field name="business_type" value={form.business_type ?? ""} onChange={setField} placeholder="LLC, Sole Proprietorship, S-Corp…" />
            <Field name="tax_id" value={form.tax_id} onChange={setField} placeholder="XX-XXXXXXX" />
            <Field name="license_number" value={form.license_number} onChange={setField} />
            <Field name="insurance_policy" value={form.insurance_policy ?? ""} onChange={setField} placeholder="Policy number" />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Contact</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field name="company_phone" value={form.company_phone} onChange={setField} type="tel" placeholder="(555) 555-5555" />
            <div>
              <Field name="company_email" value={form.company_email} onChange={setField} type="email" placeholder="you@company.com" />
              {fieldErrors.company_email && <p className="mt-1 text-xs text-danger">{fieldErrors.company_email}</p>}
            </div>
            <div>
              <Field name="bcc_email" value={form.bcc_email ?? ""} onChange={setField} type="email" placeholder="e.g. office@yourcompany.com" />
              {fieldErrors.bcc_email && <p className="mt-1 text-xs text-danger">{fieldErrors.bcc_email}</p>}
              <p className="mt-1 text-xs text-muted-foreground">Default BCC on customer emails — overridable per Business Profile.</p>
            </div>
            <Field name="company_website" value={form.company_website} onChange={setField} placeholder="https://…" />
            <Field name="company_website_2" value={form.company_website_2 ?? ""} onChange={setField} placeholder="https://… (optional second site)" />
            <div>
              <Field name="review_link" value={form.review_link ?? ""} onChange={setField} placeholder="https://g.page/r/…/review" />
              <p className="mt-1 text-xs text-muted-foreground">
                Sent to clients a week after an invoice is paid in full. Leave blank to skip that email.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Address</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field name="company_address" value={form.company_address} onChange={setField} placeholder="Street address" className="sm:col-span-2" />
            <Field name="city" value={form.city ?? ""} onChange={setField} />
            <Field name="state" value={form.state ?? ""} onChange={setField} />
            <Field name="zip" value={form.zip ?? ""} onChange={setField} />
            <Field name="country" value={form.country ?? ""} onChange={setField} />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Branding</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Logo</label>
              <div className="flex items-center gap-3">
                {form.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logo_url} alt="Company logo" className="h-12 w-12 rounded-lg border border-border object-contain bg-white" />
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                  <Upload className="size-3.5" /> {uploadingLogo ? "Uploading…" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingLogo || !canUpdate}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleLogoUpload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <div>
              <Field name="brand_color" value={form.brand_color ?? ""} onChange={setField} placeholder="#1E40AF" />
              {fieldErrors.brand_color && <p className="mt-1 text-xs text-danger">{fieldErrors.brand_color}</p>}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Terms &amp; Conditions</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Shown on Estimate Detail, the customer portal, and the generated PDF for any
            estimate using that template — including estimates already created. Leave a box
            empty to use the built-in default. A line wrapped in <code>**like this**</code>{" "}
            becomes a bold sub-heading; a line starting with <code>-</code> or <code>* </code>{" "}
            becomes a bullet.
          </p>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                {ESTIMATE_TERMS_TEMPLATES.custom.label}
              </label>
              <textarea
                value={form.terms_custom ?? ""}
                onChange={(e) => setField("terms_custom", e.target.value)}
                rows={6}
                placeholder={ESTIMATE_TERMS_TEMPLATES.custom.body}
                className="w-full rounded-lg border border-input bg-background px-2.5 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                {ESTIMATE_TERMS_TEMPLATES.roofing.label}
              </label>
              <textarea
                value={form.terms_roofing ?? ""}
                onChange={(e) => setField("terms_roofing", e.target.value)}
                rows={6}
                placeholder={ESTIMATE_TERMS_TEMPLATES.roofing.body}
                className="w-full rounded-lg border border-input bg-background px-2.5 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                {ESTIMATE_TERMS_TEMPLATES.home_remodel.label}
              </label>
              <textarea
                value={form.terms_home_remodel ?? ""}
                onChange={(e) => setField("terms_home_remodel", e.target.value)}
                rows={6}
                placeholder={ESTIMATE_TERMS_TEMPLATES.home_remodel.body}
                className="w-full rounded-lg border border-input bg-background px-2.5 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Payment Instructions</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Shown to the customer on the estimate PDF and the customer portal — e.g. how to pay
            (check payable to, bank transfer details, accepted cards, a deposit policy).
          </p>
          <textarea
            value={form.payment_instructions ?? ""}
            onChange={(e) => setField("payment_instructions", e.target.value)}
            rows={4}
            placeholder="e.g. Make checks payable to Acme Roofing LLC. A 50% deposit is due at signing, with the balance due on completion."
            className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </section>

        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Notes</h2>
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => setField("notes", e.target.value)}
            rows={4}
            placeholder="Internal notes about this company profile — not shown to customers."
            className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        </section>
      </fieldset>

      {canUpdate && (
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => setForm(initial)}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            Discard changes
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={handleSave}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </PageContainer>
  );
}

export default function CompanySettingsPage() {
  return (
    <RequirePermission resource="company_settings" action="view">
      <CompanySettingsContent />
    </RequirePermission>
  );
}
