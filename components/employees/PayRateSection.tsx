"use client";

/**
 * An employee's pay rate: the current one, its history, and "Change rate"
 * with the date it starts. Default start = the next pay period, so almost
 * every check has one rate.
 *
 * The rule (lib/payRates.ts): unpaid hours use the rate in effect on the
 * day worked; paid hours never change. Saving re-applies the history to
 * unpaid hours in the database and reports how many entries changed.
 */
import { useCallback, useEffect, useState } from "react";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Employee } from "@/lib/services/employeeService";
import { FROM_THE_START, nextPayPeriodStart, rateOn, rateTimeline, type PayRate } from "@/lib/payRates";
import { shortDate } from "@/lib/payPeriods";

const INPUT =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";
const LABEL = "mb-1 block text-xs font-medium text-muted-foreground";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const today = () => new Date().toLocaleDateString("en-CA");
const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const per = (t: "hourly" | "daily") => (t === "daily" ? "/day" : "/hr");

export function PayRateSection({ employee, onChanged }: { employee: Employee; onChanged?: () => void }) {
  const { employeeService } = useServices();
  const { profile } = useAuth();
  const [history, setHistory] = useState<PayRate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const nextPeriod = nextPayPeriodStart(employee.payFrequency);
  const [draft, setDraft] = useState({ rate: "", payType: employee.payType, startMode: "next" as "next" | "date", date: today(), note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setHistory(await employeeService.listPayRates(employee.id));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load pay rates.");
    }
  }, [employeeService, employee.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const current = history ? rateOn(history, today()) : null;
  const upcoming = (history ?? []).filter((r) => r.effectiveDate > today()).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0] ?? null;

  async function save() {
    if (!profile?.companyId) return;
    const rate = Number(draft.rate);
    if (draft.rate.trim() === "" || !(rate >= 0)) return setError("Enter the new rate.");
    const effectiveDate = draft.startMode === "next" ? nextPeriod : draft.date;
    setSaving(true);
    setError(null);
    try {
      const changed = await employeeService.changePayRate({
        companyId: profile.companyId,
        employeeId: employee.id,
        rate,
        payType: draft.payType,
        effectiveDate,
        note: draft.note,
      });
      setOpen(false);
      setDraft({ rate: "", payType: draft.payType, startMode: "next", date: today(), note: "" });
      setNotice(
        `${money(rate)}${per(draft.payType)} starts ${longDate(effectiveDate)}.` +
          (changed > 0 ? ` ${changed} unpaid time ${changed === 1 ? "entry" : "entries"} updated.` : "")
      );
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the rate.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: PayRate) {
    setError(null);
    try {
      const changed = await employeeService.removePayRate(r.id, employee.id);
      setNotice(`Removed the ${money(r.rate)}${per(r.payType)} rate from ${longDate(r.effectiveDate)}.` + (changed > 0 ? ` ${changed} unpaid entries updated.` : ""));
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the rate.");
    }
  }

  if (loadError) {
    // Before the pay-rate migration runs: the current rate, read-only.
    return (
      <div>
        <div className={LABEL}>Pay rate</div>
        <div className="text-sm text-foreground">
          {money(employee.hourlyRate)}
          {per(employee.payType)}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Rate changes need migration 20261029080000_employee_pay_rates.sql.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className={LABEL}>Pay rate</div>
          <div className="text-base font-semibold tabular-nums text-foreground">
            {current ? `${money(current.rate)}${per(current.payType)}` : `${money(employee.hourlyRate)}${per(employee.payType)}`}
            {current && current.effectiveDate !== FROM_THE_START && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">since {longDate(current.effectiveDate)}</span>
            )}
          </div>
          {upcoming && (
            <div className="text-xs text-primary">
              {money(upcoming.rate)}
              {per(upcoming.payType)} starts {longDate(upcoming.effectiveDate)}
            </div>
          )}
        </div>
        {!open && (
          <button type="button" onClick={() => { setOpen(true); setNotice(null); setError(null); }} className="text-sm font-medium text-primary hover:underline">
            Change rate
          </button>
        )}
      </div>

      {notice && <div className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">{notice}</div>}
      {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}

      {open && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL}>New rate</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
                <input autoFocus inputMode="decimal" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} placeholder="0.00" className={`${INPUT} pl-6`} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Paid</label>
              <select value={draft.payType} onChange={(e) => setDraft({ ...draft, payType: e.target.value as "hourly" | "daily" })} className={INPUT}>
                <option value="hourly">Per hour</option>
                <option value="daily">Per day</option>
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Starts</label>
            <div className="flex flex-col gap-1.5 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={draft.startMode === "next"} onChange={() => setDraft({ ...draft, startMode: "next" })} />
                Next pay period · {longDate(nextPeriod)}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={draft.startMode === "date"} onChange={() => setDraft({ ...draft, startMode: "date" })} />
                On a date
                {draft.startMode === "date" && (
                  <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="ml-1 rounded-md border border-input bg-background px-2 py-1 text-sm" />
                )}
              </label>
            </div>
          </div>
          <div>
            <label className={LABEL}>Note</label>
            <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="e.g. Annual raise (optional)" className={INPUT} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Hours worked from the start date that aren&apos;t paid yet switch to the new rate. Hours already paid keep the rate they were paid at; if
            the raise reaches back into a paid period, add a correction in Payroll.
          </p>
          <div className="flex justify-end gap-2 text-sm">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {saving ? "Saving…" : "Save rate"}
            </button>
          </div>
        </div>
      )}

      {history && history.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border text-xs">
          {rateTimeline(history).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="tabular-nums text-foreground">
                {money(r.rate)}
                {per(r.payType)}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {r.effectiveDate === FROM_THE_START ? "From the start" : `From ${shortDate(r.effectiveDate)}, ${r.effectiveDate.slice(0, 4)}`}
                {r.endsOn ? ` to ${shortDate(r.endsOn)}, ${r.endsOn.slice(0, 4)}` : r.effectiveDate > today() ? " (upcoming)" : " (current)"}
                {r.note ? ` · ${r.note}` : ""}
              </span>
              {r.effectiveDate > today() && (
                <button type="button" onClick={() => remove(r)} className="shrink-0 text-muted-foreground hover:text-danger">
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
