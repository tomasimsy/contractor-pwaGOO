/**
 * Real Supabase-backed TimeEntryService — `time_entries`
 * (migration 20261021000000_employees_timesheets.sql). RLS limits an
 * employee login to its own entries and stops it changing approved ones.
 *
 * The one-open-shift rule is checked here first, for a clear message, and
 * enforced again by a unique index in the database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateShiftHours,
  type ClockInInput,
  type ManualEntryInput,
  type TimeEntry,
  type TimeEntryService,
} from "../timeEntryService";
import type { QueryScope, UUID, ISODate, ISODateTime } from "../types";
import type { ValidationService } from "../validationService";

interface TimeEntryRow {
  id: string;
  company_id: string;
  employee_id: string;
  estimate_id: string | null;
  work_date: string;
  started_at: string | null;
  ended_at: string | null;
  hours: number | string | null;
  rate: number | string;
  pay_type: "hourly" | "daily";
  notes: string | null;
  status: "submitted" | "approved";
  entered_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

function rowToTimeEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,
    estimateId: row.estimate_id,
    workDate: row.work_date,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    hours: row.hours === null ? null : Number(row.hours),
    rate: Number(row.rate),
    payType: row.pay_type,
    notes: row.notes,
    status: row.status,
    enteredBy: row.entered_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

export function createSupabaseTimeEntryService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  currentUserId: () => Promise<UUID | null>
): TimeEntryService {
  async function fetchById(entryId: UUID): Promise<TimeEntry> {
    const { data, error } = await supabase.from("time_entries").select("*").eq("id", entryId).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`Failed to load time entry: ${error.message}`);
    if (!data) throw new Error("Time entry not found.");
    return rowToTimeEntry(data as TimeEntryRow);
  }

  /** Hours in a pay period that has been paid cannot change. A correction is an adjustment instead. */
  async function assertPeriodOpen(employeeId: UUID, workDate: ISODate): Promise<void> {
    const { count, error } = await supabase
      .from("payee_payments")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .eq("payment_kind", "pay")
      .is("reversed_at", null)
      .lte("period_start", workDate)
      .gte("period_end", workDate);
    if (error) throw new Error(`Failed to check pay periods: ${error.message}`);
    if ((count ?? 0) > 0) {
      throw new Error("This day is in a pay period that has already been paid, so its hours are locked. Add an adjustment on the Payroll page instead.");
    }
  }

  async function getOpenShift(employeeId: UUID): Promise<TimeEntry | null> {
    const { data, error } = await supabase
      .from("time_entries")
      .select("*")
      .eq("employee_id", employeeId)
      .not("started_at", "is", null)
      .is("ended_at", null)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(`Failed to check for an open shift: ${error.message}`);
    return data ? rowToTimeEntry(data as TimeEntryRow) : null;
  }

  async function clockIn(input: ClockInInput): Promise<TimeEntry> {
    const open = await getOpenShift(input.employeeId);
    if (open) throw new Error("This employee is already clocked in. Clock them out first.");
    const { data, error } = await supabase
      .from("time_entries")
      .insert({
        company_id: input.companyId,
        employee_id: input.employeeId,
        estimate_id: input.estimateId,
        work_date: input.workDate,
        started_at: input.startedAt ?? new Date().toISOString(),
        ended_at: null,
        hours: null,
        rate: input.rate,
        pay_type: input.payType,
        status: "submitted",
        entered_by: input.enteredBy,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("This employee is already clocked in. Clock them out first.");
      // Refused by the database: an employee may log time only on company time or an assigned job.
      if (error.code === "42501") throw new Error("You're not assigned to this job any more. Refresh the page to see your current jobs.");
      throw new Error(`Failed to clock in: ${error.message}`);
    }
    return rowToTimeEntry(data as TimeEntryRow);
  }

  async function clockOut(entryId: UUID, endedAt?: ISODateTime): Promise<TimeEntry> {
    const entry = await fetchById(entryId);
    if (!entry.startedAt || entry.endedAt) throw new Error("This entry is not an open shift.");
    const ended = endedAt ?? new Date().toISOString();
    const hours = calculateShiftHours(entry.startedAt, ended);
    const { data, error } = await supabase
      .from("time_entries")
      .update({ ended_at: ended, hours, updated_at: new Date().toISOString() })
      .eq("id", entryId)
      .select()
      .single();
    if (error) throw new Error(`Failed to clock out: ${error.message}`);
    return rowToTimeEntry(data as TimeEntryRow);
  }

  async function addManualEntry(input: ManualEntryInput): Promise<TimeEntry> {
    await assertPeriodOpen(input.employeeId, input.workDate);
    if (!(input.hours > 0) || input.hours > 24) throw new Error("Hours must be more than 0 and at most 24.");
    const { data, error } = await supabase
      .from("time_entries")
      .insert({
        company_id: input.companyId,
        employee_id: input.employeeId,
        estimate_id: input.estimateId,
        work_date: input.workDate,
        started_at: null,
        ended_at: null,
        hours: input.hours,
        rate: input.rate,
        pay_type: input.payType,
        notes: input.notes ?? null,
        status: "submitted",
        entered_by: input.enteredBy,
      })
      .select()
      .single();
    if (error?.code === "42501") throw new Error("This person isn't assigned to that job, so time can't be added to it.");
    if (error) throw new Error(`Failed to add time: ${error.message}`);
    return rowToTimeEntry(data as TimeEntryRow);
  }

  async function listForEmployee(employeeId: UUID, range?: { from?: ISODate; to?: ISODate }): Promise<TimeEntry[]> {
    let query = supabase.from("time_entries").select("*").eq("employee_id", employeeId).is("deleted_at", null);
    if (range?.from) query = query.gte("work_date", range.from);
    if (range?.to) query = query.lte("work_date", range.to);
    const { data, error } = await query.order("work_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load timesheet: ${error.message}`);
    return (data as TimeEntryRow[]).map(rowToTimeEntry);
  }

  async function listForCompany(scope: QueryScope, range?: { from?: ISODate; to?: ISODate }): Promise<TimeEntry[]> {
    let query = supabase.from("time_entries").select("*").eq("company_id", scope.companyId);
    if (!scope.includeDeleted) query = query.is("deleted_at", null);
    if (range?.from) query = query.gte("work_date", range.from);
    if (range?.to) query = query.lte("work_date", range.to);
    const { data, error } = await query.order("work_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load time entries: ${error.message}`);
    return (data as TimeEntryRow[]).map(rowToTimeEntry);
  }

  async function updateEntry(
    entryId: UUID,
    changes: Partial<Pick<TimeEntry, "estimateId" | "workDate" | "notes" | "hours" | "startedAt" | "endedAt">>
  ): Promise<TimeEntry> {
    const current = await fetchById(entryId);
    await assertPeriodOpen(current.employeeId, current.workDate);
    if (changes.workDate && changes.workDate !== current.workDate) await assertPeriodOpen(current.employeeId, changes.workDate);

    const startedAt = changes.startedAt !== undefined ? changes.startedAt : current.startedAt;
    const endedAt = changes.endedAt !== undefined ? changes.endedAt : current.endedAt;
    // With both clock times present, hours always follow the times.
    const hours = startedAt && endedAt ? calculateShiftHours(startedAt, endedAt) : changes.hours !== undefined ? changes.hours : current.hours;

    const payload: Record<string, unknown> = { hours, started_at: startedAt, ended_at: endedAt, updated_at: new Date().toISOString() };
    if (changes.estimateId !== undefined) payload.estimate_id = changes.estimateId;
    if (changes.workDate !== undefined) payload.work_date = changes.workDate;
    if (changes.notes !== undefined) payload.notes = changes.notes;
    // Changing an approved entry sends it back for approval, so the cost
    // only counts again once someone has approved the corrected hours.
    if (current.status === "approved") {
      payload.status = "submitted";
      payload.approved_by = null;
      payload.approved_at = null;
    }

    const { data, error } = await supabase.from("time_entries").update(payload).eq("id", entryId).select().single();
    if (error) throw new Error(`Failed to update time entry: ${error.message}`);
    return rowToTimeEntry(data as TimeEntryRow);
  }

  async function approve(entryIds: UUID[], approverId: UUID): Promise<void> {
    if (entryIds.length === 0) return;
    const { error } = await supabase
      .from("time_entries")
      .update({ status: "approved", approved_by: approverId, approved_at: new Date().toISOString() })
      .in("id", entryIds)
      .eq("status", "submitted")
      // An open shift (started, not yet ended) cannot be approved. Manual hours entries have no clock times and can.
      .or("started_at.is.null,ended_at.not.is.null")
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to approve time: ${error.message}`);
  }

  async function softDelete(entryId: UUID, reason: string): Promise<void> {
    const validation = validationService.validateDeleteReason(reason);
    if (!validation.valid) throw new Error(validation.issues?.[0]?.message ?? "A delete reason is required.");
    const entry = await fetchById(entryId);
    await assertPeriodOpen(entry.employeeId, entry.workDate);
    if (entry.status === "approved") throw new Error("An approved entry cannot be deleted.");
    const actorId = await currentUserId();
    const { error } = await supabase
      .from("time_entries")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", entryId);
    if (error) throw new Error(`Failed to delete time entry: ${error.message}`);
  }

  return {
    getOpenShift,
    clockIn,
    clockOut,
    addManualEntry,
    listForEmployee,
    listForCompany,
    updateEntry,
    approve,
    softDelete,
  };
}
