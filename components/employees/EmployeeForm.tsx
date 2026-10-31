"use client";

import { PayRateSection } from "@/components/employees/PayRateSection";
import { useEffect, useRef, useState } from "react";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import type { Employee } from "@/lib/services/employeeService";
import {
  formatPhone,
  formatSsn,
  formatState,
  formatZip,
  JOB_TITLE_SUGGESTIONS,
  ssnLast4,
  US_STATES,
} from "@/lib/employeeFormat";

const INPUT =
  "w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";
const LABEL = "mb-1 block text-xs font-medium text-foreground";
const SECTION = "space-y-2";
const SECTION_TITLE = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

type LoginOption = { id: string; email: string | null; fullName: string | null };

/** Same generator the Team page uses: an admin-chosen starting password. */
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** "12", "emp12" or "EMP-12" -> "EMP-0012". Anything else (a number from
 * another system) is kept as typed, upper-cased. */
function normalizeEmployeeNumber(raw: string): string {
  const v = raw.trim().toUpperCase();
  const m = v.match(/^(?:EMP-?)?(\d{1,6})$/);
  return m ? `EMP-${m[1].padStart(4, "0")}` : v;
}

/** Create or edit one employee profile. Built for quick entry: fields are in
 * the order people fill in paperwork, phone and SSN format as you type, the
 * address and phone use browser autofill, and "Save and add another" keeps
 * you moving through a crew. The full SSN is never sent to the server; only
 * its last four digits are. */
export function EmployeeForm({
  employee,
  onSaved,
  onCancel,
}: {
  employee?: Employee;
  /** `addAnother` is true when the admin chose "Save and add another". */
  onSaved: (employee: Employee, addAnother: boolean) => void;
  onCancel: () => void;
}) {
  const { employeeService } = useServices();
  const { profile } = useAuth();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(employee?.name ?? "");
  const [jobTitle, setJobTitle] = useState(employee?.jobTitle ?? "");
  const [employeeNumber, setEmployeeNumber] = useState(employee?.employeeNumber ?? "");
  const [phone, setPhone] = useState(employee?.phone ? formatPhone(employee.phone) : "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [hourlyRate, setHourlyRate] = useState(employee ? String(employee.hourlyRate) : "");
  // "hourly" = rate per hour; "daily" = fixed rate per day worked.
  const [payType, setPayType] = useState<"hourly" | "daily">(employee?.payType ?? "hourly");
  const [payFrequency, setPayFrequency] = useState<"weekly" | "biweekly">(employee?.payFrequency ?? "biweekly");
  const [hireDate, setHireDate] = useState(employee?.hireDate ?? today());
  const [street, setStreet] = useState(employee?.addressStreet ?? "");
  const [city, setCity] = useState(employee?.addressCity ?? "");
  const [state, setState] = useState(employee?.addressState ?? "");
  const [zip, setZip] = useState(employee?.addressZip ?? "");
  const [emergencyName, setEmergencyName] = useState(employee?.emergencyContactName ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(employee?.emergencyContactPhone ? formatPhone(employee.emergencyContactPhone) : "");
  // The full SSN is typed here and reduced to its last four before saving.
  // An existing record shows only the masked last four and is left alone unless changed.
  const [ssn, setSsn] = useState("");
  const [notes, setNotes] = useState(employee?.notes ?? "");
  const [isActive, setIsActive] = useState(employee?.isActive ?? true);
  const [profileId, setProfileId] = useState(employee?.profileId ?? "");
  const [logins, setLogins] = useState<LoginOption[]>([]);
  const [createLogin, setCreateLogin] = useState(false);
  const [loginPassword, setLoginPassword] = useState(generatePassword());
  // Shown once after a login is created, so the admin can hand it over.
  const [created, setCreated] = useState<{ employee: Employee; password: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!employee) nameRef.current?.focus();
  }, [employee]);

  useEffect(() => {
    // Same RPC the Team page uses; lists every member of the company.
    supabase.rpc("list_company_members").then(({ data }) => {
      const rows = ((data ?? []) as Array<{ id: string; email: string | null; role: string | null; full_name?: string | null }>)
        .filter((m) => m.role === "employee")
        .map((m) => ({ id: m.id, email: m.email, fullName: m.full_name?.trim() || null }));
      setLogins(rows);
    });
  }, []);

  async function createLoginFor(loginEmail: string, password: string): Promise<string> {
    const response = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password, role: "employee" }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; userId?: string; error?: string } | null;
    if (!response.ok || !body?.ok || !body.userId) throw new Error(body?.error ?? "Could not create the login.");
    return body.userId;
  }

  async function handleSubmit(e: React.FormEvent, addAnother: boolean) {
    e.preventDefault();
    if (!profile?.companyId) return;
    setError(null);

    if (!name.trim()) return setError("Enter the employee's name.");
    const rate = hourlyRate.trim() === "" ? 0 : Number(hourlyRate);
    if (!Number.isFinite(rate) || rate < 0) return setError("Rate must be 0 or more.");

    const digitsInSsn = ssn.replace(/\D/g, "");
    if (digitsInSsn.length > 0 && digitsInSsn.length !== 9) return setError("SSN needs all 9 digits, or leave it blank.");
    const last4 = digitsInSsn.length === 9 ? ssnLast4(ssn) : undefined;

    if (state && !US_STATES.some((s) => s.code === state)) return setError("Choose a valid state.");

    const wantsNewLogin = !employee && createLogin;
    if (wantsNewLogin) {
      if (!email.trim()) return setError("A login needs an email address.");
      if (loginPassword.length < 8) return setError("The password must be at least 8 characters.");
    }

    setSaving(true);
    try {
      const newLoginId = wantsNewLogin ? await createLoginFor(email.trim().toLowerCase(), loginPassword) : null;
      const fields = {
        name: name.trim(),
        jobTitle: jobTitle.trim() || null,
        // Blank on a new employee: the next EMP- number is assigned automatically.
        ...(employeeNumber.trim() ? { employeeNumber: normalizeEmployeeNumber(employeeNumber) } : {}),
        phone: phone.trim() || null,
        email: email.trim() || null,
        // A rate change on an existing employee goes through Change rate (dated
        // history); only a new employee's starting rate is set here.
        ...(employee ? {} : { hourlyRate: rate, payType }),
        payFrequency,
        hireDate: hireDate || null,
        addressStreet: street.trim() || null,
        addressCity: city.trim() || null,
        addressState: state || null,
        addressZip: zip.trim() || null,
        emergencyContactName: emergencyName.trim() || null,
        emergencyContactPhone: emergencyPhone.trim() || null,
        // Only sent when a new SSN was typed; the full number never leaves this form.
        ...(last4 !== undefined ? { ssnLast4: last4 } : {}),
        notes: notes.trim() || null,
        profileId: newLoginId ?? (profileId || null),
        // Only an existing employee can be made inactive; a new one starts active.
        ...(employee ? { isActive } : {}),
      };
      const saved = employee
        ? await employeeService.update(employee.id, fields)
        : await employeeService.create({ companyId: profile.companyId, ...fields, ssnLast4: last4 ?? null });
      if (newLoginId) {
        setCreated({ employee: saved, password: loginPassword });
      } else {
        onSaved(saved, addAnother);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save employee.");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-primary/10 px-3 py-3 text-sm text-foreground">
          <div className="font-semibold">Login created for {created.employee.name}</div>
          <div className="mt-2 text-xs text-muted-foreground">Email</div>
          <div className="font-mono text-sm">{email.trim().toLowerCase()}</div>
          <div className="mt-2 text-xs text-muted-foreground">Starting password (shown once)</div>
          <div className="font-mono text-sm">{created.password}</div>
        </div>
        <p className="text-xs text-muted-foreground">Give these to the employee yourself. They can change the password after they sign in.</p>
        <div className="flex justify-end">
          <button type="button" onClick={() => onSaved(created.employee, false)} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Done
          </button>
        </div>
      </div>
    );
  }

  const existingLast4 = employee?.ssnLast4;

  return (
    <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5">
      {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <section className={SECTION}>
        <h3 className={SECTION_TITLE}>Who</h3>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={LABEL}>Full name *</label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Job title</label>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              list="employee-job-titles"
              autoComplete="organization-title"
              className={INPUT}
            />
            <datalist id="employee-job-titles">
              {JOB_TITLE_SUGGESTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={LABEL}>Employee number</label>
            <input
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value.toUpperCase())}
              onBlur={() => employeeNumber.trim() && setEmployeeNumber(normalizeEmployeeNumber(employeeNumber))}
              placeholder={employee ? "EMP-0001" : "Assigned automatically"}
              className={`${INPUT} font-mono tracking-wide`}
            />
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="(555) 555-5555"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT}
            />
          </div>
        </div>
      </section>

      <section className={SECTION}>
        <h3 className={SECTION_TITLE}>Pay</h3>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {employee ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <PayRateSection employee={employee} />
            </div>
          ) : (
            <>
          <div className="sm:col-span-2 lg:col-span-3">
            <div className="mb-1 inline-flex rounded-lg border border-input p-0.5">
              {(["hourly", "daily"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPayType(t)}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${payType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t === "hourly" ? "Hourly" : "Day rate"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={LABEL}>{payType === "hourly" ? "Hourly rate" : "Day rate"}</label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
              <input
                inputMode="decimal"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="0.00"
                className={`${INPUT} pl-6`}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {payType === "hourly" ? "Paid per hour worked." : "Paid once per day worked. A day split between jobs is shared by hours."} Raises later go through Change rate, with the date they start.
            </p>
          </div>
            </>
          )}
          <div>
            <label className={LABEL}>Pay frequency</label>
            <select value={payFrequency} onChange={(e) => setPayFrequency(e.target.value as "weekly" | "biweekly")} className={INPUT}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every two weeks</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Hire date</label>
            <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} className={INPUT} />
          </div>
        </div>
      </section>

      <section className={SECTION}>
        <h3 className={SECTION_TITLE}>Home address</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="sm:col-span-6">
            <label className={LABEL}>Street</label>
            <input value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="street-address" className={INPUT} />
          </div>
          <div className="sm:col-span-3">
            <label className={LABEL}>City</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" className={INPUT} />
          </div>
          <div className="sm:col-span-1">
            <label className={LABEL}>State</label>
            <select value={state} onChange={(e) => setState(formatState(e.target.value))} autoComplete="address-level1" className={INPUT}>
              <option value="">—</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>{s.code} · {s.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>ZIP</label>
            <input
              inputMode="numeric"
              autoComplete="postal-code"
              value={zip}
              onChange={(e) => setZip(formatZip(e.target.value))}
              className={INPUT}
            />
          </div>
        </div>
      </section>

      {/* Two short sections side by side on wider screens. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className={SECTION}>
          <h3 className={SECTION_TITLE}>Emergency contact</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Name</label>
              <input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} autoComplete="off" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Phone</label>
              <input
                type="tel"
                inputMode="tel"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(formatPhone(e.target.value))}
                className={INPUT}
              />
            </div>
          </div>
        </section>

        <section className={SECTION}>
          <h3 className={SECTION_TITLE}>Tax</h3>
          <div>
            <div>
              <label className={LABEL}>Social Security number</label>
              <input
                inputMode="numeric"
                autoComplete="off"
                value={ssn}
                onChange={(e) => setSsn(formatSsn(e.target.value))}
                placeholder={existingLast4 ? `•••-••-${existingLast4}` : "XXX-XX-XXXX"}
                className={INPUT}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {existingLast4
                  ? `On file: ending in ${existingLast4}. Leave blank to keep it.`
                  : "Only the last four digits are kept. The full number is not stored."}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className={SECTION}>
        <h3 className={SECTION_TITLE}>App access</h3>
        {!employee && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} />
            Create an app login now (uses the email above)
          </label>
        )}
        {createLogin && !employee && (
          <div>
            <label className={LABEL}>Starting password</label>
            <input value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className={INPUT} />
            <p className="mt-1 text-[11px] text-muted-foreground">Shown once after saving.</p>
          </div>
        )}
        {!createLogin && (
          <div>
            <label className={LABEL}>Existing login</label>
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={INPUT}>
              <option value="">No login</option>
              {logins.map((l) => (
                <option key={l.id} value={l.id}>{l.fullName || l.email || "Unnamed login"}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">Only accounts with the Employee role appear here.</p>
          </div>
        )}
      </section>

      <section className={SECTION}>
        <div>
          <label className={LABEL}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={INPUT} />
        </div>
        {employee && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-medium text-foreground">Active</span>
              <span className="block text-xs text-muted-foreground">
                Inactive people keep their past timesheets and payroll, but are left out of the timesheet and payroll employee lists.
              </span>
            </span>
          </label>
        )}
      </section>

      {/* Pinned to the bottom of the window, so Save is always in reach. */}
      <div className="sticky -bottom-4 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-4 py-3 sm:-bottom-6 sm:-mx-6 sm:px-6">
        <button type="button" onClick={onCancel} className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
          Cancel
        </button>
        {!employee && (
          <button
            type="button"
            disabled={saving}
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}
            className="rounded-lg border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
          >
            Save and add another
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Saving…" : employee ? "Save employee" : "Add employee"}
        </button>
      </div>
    </form>
  );
}
