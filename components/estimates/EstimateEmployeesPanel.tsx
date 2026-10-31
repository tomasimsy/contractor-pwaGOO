"use client";

import { buttonClass } from "@/components/ui/Button";
import { useCallback, useEffect, useState } from "react";
import { useServices } from "@/components/providers/ServicesProvider";
import type { Employee } from "@/lib/services/employeeService";
import type { JobPayMode } from "@/lib/services/jobPay";

/** Assign employees to one estimate. Assigned employees can pick this job
 * when they clock in. Assignment does not change any money: labor cost comes
 * from approved hours, not from being assigned. */
export function EstimateEmployeesPanel({
  companyId,
  estimateId,
  onChanged,
}: {
  companyId: string;
  estimateId: string;
  onChanged?: () => void;
}) {
  const { employeeService, timeEntryService } = useServices();
  const [assigned, setAssigned] = useState<Employee[]>([]);
  // Employees who already have hours on this estimate. They cannot be removed.
  const [withHours, setWithHours] = useState<Set<string>>(new Set());
  // Job pay per employee on this estimate: a fixed amount instead of hourly.
  const [jobPay, setJobPayState] = useState<Map<string, { amount: number; mode: JobPayMode }>>(new Map());
  const [payMode, setPayMode] = useState<Record<string, JobPayMode>>({});
  const [payDraft, setPayDraft] = useState<Record<string, string>>({});
  const [available, setAvailable] = useState<Employee[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mine, all, entries, pays] = await Promise.all([
        employeeService.listForEstimate(estimateId),
        employeeService.list({ companyId }),
        timeEntryService.listForCompany({ companyId }),
        employeeService.listJobPays(companyId),
      ]);
      setJobPayState(new Map(pays.filter((p) => p.estimateId === estimateId).map((p) => [p.employeeId, { amount: p.amount, mode: p.mode }])));
      setAssigned(mine);
      setWithHours(new Set(entries.filter((e) => e.estimateId === estimateId).map((e) => e.employeeId)));
      setAvailable(all.filter((e) => e.isActive && !mine.some((m) => m.id === e.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employees.");
    }
  }, [employeeService, timeEntryService, companyId, estimateId]);

  async function savePay(employeeId: string, amount: number | null) {
    const mode = payMode[employeeId] ?? "replace";
    setBusy(true);
    setError(null);
    try {
      await employeeService.setJobPay({ companyId, estimateId, employeeId, amount, mode });
      setPayDraft((d) => ({ ...d, [employeeId]: "" }));
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save job pay.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function assign() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      await employeeService.assignToEstimate({ companyId, estimateId, employeeId: pick });
      setPick("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign employee.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(employeeId: string) {
    setBusy(true);
    setError(null);
    try {
      await employeeService.unassignFromEstimate({ estimateId, employeeId });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove employee.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}

      {assigned.length === 0 ? (
        <p className="text-xs text-gray-600">No employees assigned to this estimate.</p>
      ) : (
        <ul className="divide-y divide-border">
          {assigned.map((e) => (
            <li key={e.id} className="space-y-1.5 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="text-sm font-semibold text-gray-900">{e.name}</span>
                {withHours.has(e.id) ? (
                  <span className="text-xs text-gray-600" title="Hours are recorded on this estimate">Has hours</span>
                ) : (
                  <button type="button" disabled={busy} onClick={() => remove(e.id)} className="text-xs text-danger hover:underline disabled:opacity-60">
                    Remove
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                {jobPay.has(e.id) ? (
                  <>
                    <span className="rounded-full bg-[#E7F3F2] px-2 py-0.5 font-medium text-[#0B5F5E]">
                      Job pay ${jobPay.get(e.id)?.amount.toFixed(2)} · {jobPay.get(e.id)?.mode === "add" ? "plus hourly" : "replaces hourly"}
                    </span>
                    <span className="text-gray-600">paid when the project is completed</span>
                    <button type="button" disabled={busy} onClick={() => savePay(e.id, null)} className="ml-auto text-gray-600 hover:underline disabled:opacity-60">
                      Switch to hourly
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-gray-600">Hourly</span>
                    <select
                      value={payMode[e.id] ?? "replace"}
                      onChange={(ev) => setPayMode((m) => ({ ...m, [e.id]: ev.target.value as JobPayMode }))}
                      className="rounded-md border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900"
                      aria-label="Job pay mode"
                    >
                      <option value="replace">Replaces hourly</option>
                      <option value="add">Plus hourly</option>
                    </select>
                    <input
                      inputMode="decimal"
                      placeholder="Job pay $"
                      value={payDraft[e.id] ?? ""}
                      onChange={(ev) => setPayDraft((d) => ({ ...d, [e.id]: ev.target.value }))}
                      className="ml-auto w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder:text-gray-500"
                    />
                    <button
                      type="button"
                      disabled={busy || !(Number(payDraft[e.id]) >= 0) || (payDraft[e.id] ?? "") === ""}
                      onClick={() => savePay(e.id, Number(payDraft[e.id]))}
                      className={buttonClass("secondary", "h-7 px-2.5 text-xs")}
                    >
                      Set job pay
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="">Choose an employee…</option>
          {available.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !pick}
          onClick={assign}
          className={buttonClass("primary", "h-8 shrink-0")}
        >
          Assign
        </button>
      </div>
    </div>
  );
}
