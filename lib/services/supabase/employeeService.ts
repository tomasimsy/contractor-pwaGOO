/**
 * Real Supabase-backed EmployeeService — `employees` and `estimate_employees`
 * (migration 20261021000000_employees_timesheets.sql). RLS is the access
 * control; every query is also scoped by company as defense in depth.
 *
 * Soft delete is an explicit UPDATE with a required reason. Audit rows come
 * from the generic log_audit_change() trigger, as for clients and projects.
 */
import type { PayRate } from "../../payRates";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignedJob, Employee, EmployeeService, CreateEmployeeInput, UpdateEmployeeInput } from "../employeeService";
import type { JobPayMode } from "../jobPay";
import type { QueryScope, UUID } from "../types";
import type { ValidationService } from "../validationService";

interface EmployeeRow {
  id: string;
  company_id: string;
  profile_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  hourly_rate: number | string;
  pay_type: "hourly" | "daily";
  pay_frequency: "weekly" | "biweekly";
  is_active: boolean;
  job_title: string | null;
  hire_date: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  ssn_last4: string | null;
  employee_number?: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
}

function rowToEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    companyId: row.company_id,
    profileId: row.profile_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    hourlyRate: Number(row.hourly_rate),
    payType: row.pay_type,
    payFrequency: row.pay_frequency,
    isActive: row.is_active,
    jobTitle: row.job_title,
    hireDate: row.hire_date,
    addressStreet: row.address_street,
    addressCity: row.address_city,
    addressState: row.address_state,
    addressZip: row.address_zip,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    ssnLast4: row.ssn_last4,
    employeeNumber: row.employee_number ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at ?? row.created_at,
    deletedBy: row.deleted_by,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
  };
}

export function createSupabaseEmployeeService(
  supabase: SupabaseClient,
  validationService: ValidationService,
  currentUserId: () => Promise<UUID | null>
): EmployeeService {
  /** The rate shown as "current" is the one in effect TODAY from the rate
   * history — so a raise scheduled for a future date shows up on its day
   * without anyone saving anything. (Time entries already get the right rate
   * from the database.) Before the pay-rate migration runs, nothing changes. */
  async function withCurrentRate(employees: Employee[]): Promise<Employee[]> {
    if (employees.length === 0) return employees;
    const { data, error } = await supabase
      .from("employee_pay_rates")
      .select("employee_id, rate, pay_type, effective_date")
      .in("employee_id", employees.map((e) => e.id))
      .is("deleted_at", null);
    if (error || !data) return employees;
    const today = new Date().toLocaleDateString("en-CA");
    const current = new Map<string, { rate: number; payType: "hourly" | "daily"; from: string }>();
    for (const r of data as Array<{ employee_id: string; rate: number | string; pay_type: "hourly" | "daily"; effective_date: string }>) {
      if (r.effective_date > today) continue;
      const best = current.get(r.employee_id);
      if (!best || r.effective_date > best.from) current.set(r.employee_id, { rate: Number(r.rate), payType: r.pay_type, from: r.effective_date });
    }
    return employees.map((e) => {
      const c = current.get(e.id);
      return c ? { ...e, hourlyRate: c.rate, payType: c.payType } : e;
    });
  }

  async function getById(employeeId: UUID, includeDeleted = false): Promise<Employee | null> {
    let query = supabase.from("employees").select("*").eq("id", employeeId);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Failed to load employee: ${error.message}`);
    return data ? (await withCurrentRate([rowToEmployee(data as EmployeeRow)]))[0] : null;
  }

  async function getForProfile(profileId: UUID): Promise<Employee | null> {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("profile_id", profileId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(`Failed to load your employee record: ${error.message}`);
    return data ? (await withCurrentRate([rowToEmployee(data as EmployeeRow)]))[0] : null;
  }

  async function list(scope: QueryScope): Promise<Employee[]> {
    let query = supabase.from("employees").select("*").eq("company_id", scope.companyId);
    if (!scope.includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.order("name", { ascending: true });
    if (error) throw new Error(`Failed to list employees: ${error.message}`);
    return withCurrentRate((data as EmployeeRow[]).map(rowToEmployee));
  }

  async function create(input: CreateEmployeeInput): Promise<Employee> {
    const name = input.name.trim();
    if (!name) throw new Error("An employee needs a name.");
    const { data, error } = await supabase
      .from("employees")
      .insert({
        company_id: input.companyId,
        name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        notes: input.notes ?? null,
        hourly_rate: input.hourlyRate ?? 0,
        pay_type: input.payType ?? "hourly",
        pay_frequency: input.payFrequency ?? "biweekly",
        profile_id: input.profileId ?? null,
        job_title: input.jobTitle ?? null,
        hire_date: input.hireDate ?? null,
        address_street: input.addressStreet ?? null,
        address_city: input.addressCity ?? null,
        address_state: input.addressState ?? null,
        address_zip: input.addressZip ?? null,
        emergency_contact_name: input.emergencyContactName ?? null,
        emergency_contact_phone: input.emergencyContactPhone ?? null,
        ssn_last4: input.ssnLast4 ?? null,
        // Blank = the database assigns the next number (employees_assign_number).
        ...(input.employeeNumber?.trim() ? { employee_number: input.employeeNumber.trim() } : {}),
      })
      .select()
      .single();
    if (error?.code === "23505") throw new Error("That employee number is already used by another employee.");
    if (error) throw new Error(`Failed to create employee: ${error.message}`);
    return rowToEmployee(data as EmployeeRow);
  }

  async function update(employeeId: UUID, changes: UpdateEmployeeInput): Promise<Employee> {
    const payload: Record<string, unknown> = {};
    if (changes.name !== undefined) payload.name = changes.name.trim();
    if (changes.phone !== undefined) payload.phone = changes.phone;
    if (changes.email !== undefined) payload.email = changes.email;
    if (changes.notes !== undefined) payload.notes = changes.notes;
    if (changes.hourlyRate !== undefined) payload.hourly_rate = changes.hourlyRate;
    if (changes.payType !== undefined) payload.pay_type = changes.payType;
    if (changes.payFrequency !== undefined) payload.pay_frequency = changes.payFrequency;
    if (changes.profileId !== undefined) payload.profile_id = changes.profileId;
    if (changes.isActive !== undefined) payload.is_active = changes.isActive;
    if (changes.jobTitle !== undefined) payload.job_title = changes.jobTitle;
    if (changes.hireDate !== undefined) payload.hire_date = changes.hireDate;
    if (changes.addressStreet !== undefined) payload.address_street = changes.addressStreet;
    if (changes.addressCity !== undefined) payload.address_city = changes.addressCity;
    if (changes.addressState !== undefined) payload.address_state = changes.addressState;
    if (changes.addressZip !== undefined) payload.address_zip = changes.addressZip;
    if (changes.emergencyContactName !== undefined) payload.emergency_contact_name = changes.emergencyContactName;
    if (changes.emergencyContactPhone !== undefined) payload.emergency_contact_phone = changes.emergencyContactPhone;
    if (changes.ssnLast4 !== undefined) payload.ssn_last4 = changes.ssnLast4;
    if (changes.employeeNumber !== undefined && changes.employeeNumber?.trim()) payload.employee_number = changes.employeeNumber.trim();
    const { data, error } = await supabase.from("employees").update(payload).eq("id", employeeId).select().single();
    if (error?.code === "23505") throw new Error("That employee number is already used by another employee.");
    if (error) throw new Error(`Failed to update employee: ${error.message}`);
    return rowToEmployee(data as EmployeeRow);
  }

  async function softDelete(employeeId: UUID, reason: string): Promise<void> {
    const validation = validationService.validateDeleteReason(reason);
    if (!validation.valid) throw new Error(validation.issues?.[0]?.message ?? "A delete reason is required.");
    const actorId = await currentUserId();
    const { error } = await supabase
      .from("employees")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", employeeId);
    if (error) throw new Error(`Failed to delete employee: ${error.message}`);
  }

  async function listJobPays(companyId: UUID): Promise<Array<{ estimateId: UUID; employeeId: UUID; amount: number; mode: JobPayMode }>> {
    const { data, error } = await supabase
      .from("estimate_job_pay")
      .select("estimate_id, employee_id, amount, mode")
      .eq("company_id", companyId);
    if (error) throw new Error(`Failed to load job pay: ${error.message}`);
    return ((data ?? []) as Array<{ estimate_id: string; employee_id: string; amount: number | string; mode: JobPayMode }>).map((row) => ({
      estimateId: row.estimate_id,
      employeeId: row.employee_id,
      amount: Number(row.amount),
      mode: row.mode,
    }));
  }

  async function setJobPay(input: { companyId: UUID; estimateId: UUID; employeeId: UUID; amount: number | null; mode?: JobPayMode }): Promise<void> {
    if (input.amount === null) {
      const { error } = await supabase
        .from("estimate_job_pay")
        .delete()
        .eq("estimate_id", input.estimateId)
        .eq("employee_id", input.employeeId);
      if (error) throw new Error(`Failed to remove job pay: ${error.message}`);
      return;
    }
    if (!(input.amount >= 0)) throw new Error("Job pay must be 0 or more.");
    const { error } = await supabase.from("estimate_job_pay").upsert(
      {
        company_id: input.companyId,
        estimate_id: input.estimateId,
        employee_id: input.employeeId,
        amount: input.amount,
        mode: input.mode ?? "replace",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "estimate_id,employee_id" }
    );
    if (error) throw new Error(`Failed to save job pay: ${error.message}`);
  }

  async function listMyJobPays(): Promise<Array<{ estimateId: UUID; amount: number; completed: boolean; mode: JobPayMode }>> {
    const { data, error } = await supabase.rpc("my_job_pays");
    if (error) throw new Error(`Failed to load your pay: ${error.message}`);
    return ((data ?? []) as Array<{ estimate_id: string; amount: number | string; completed: boolean; mode: JobPayMode }>).map((row) => ({
      estimateId: row.estimate_id,
      amount: Number(row.amount),
      completed: row.completed,
      mode: row.mode,
    }));
  }

  async function listAssignments(companyId: UUID): Promise<Array<{ estimateId: UUID; employeeId: UUID }>> {
    const { data, error } = await supabase
      .from("estimate_employees")
      .select("estimate_id, employee_id")
      .eq("company_id", companyId);
    if (error) throw new Error(`Failed to load crew assignments: ${error.message}`);
    return ((data ?? []) as Array<{ estimate_id: string; employee_id: string }>).map((row) => ({
      estimateId: row.estimate_id,
      employeeId: row.employee_id,
    }));
  }

  async function listMyTeamJobs(): Promise<AssignedJob[]> {
    const { data, error } = await supabase.rpc("my_team_jobs");
    if (error) throw new Error(`Failed to load your jobs: ${error.message}`);
    return ((data ?? []) as Array<{ id: string; estimate_number: string | null; title: string | null; completed: boolean }>).map((row) => ({
      id: row.id,
      estimateNumber: row.estimate_number,
      title: row.title,
      completed: row.completed,
    }));
  }

  async function listPayRates(employeeId: UUID): Promise<PayRate[]> {
    const { data, error } = await supabase
      .from("employee_pay_rates")
      .select("id, employee_id, rate, pay_type, effective_date, note, created_at")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("effective_date", { ascending: false });
    if (error) throw new Error(`Failed to load pay rates: ${error.message}`);
    return ((data ?? []) as Array<{ id: string; employee_id: string; rate: number | string; pay_type: "hourly" | "daily"; effective_date: string; note: string | null; created_at: string }>).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      rate: Number(r.rate),
      payType: r.pay_type,
      effectiveDate: r.effective_date,
      note: r.note,
      createdAt: r.created_at,
    }));
  }

  async function resync(employeeId: UUID): Promise<number> {
    const { data, error } = await supabase.rpc("resync_employee_rates", { p_employee: employeeId });
    if (error) throw new Error(`Rate saved, but hours could not be updated: ${error.message}`);
    return Number(data ?? 0);
  }

  async function changePayRate(input: { companyId: UUID; employeeId: UUID; rate: number; payType: "hourly" | "daily"; effectiveDate: string; note?: string | null }): Promise<number> {
    if (!(input.rate >= 0)) throw new Error("Enter a rate of zero or more.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) throw new Error("Choose the date the rate starts.");
    const actorId = await currentUserId();
    // One rate per day: a second change for the same date replaces the first.
    const { error: clearError } = await supabase
      .from("employee_pay_rates")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId })
      .eq("employee_id", input.employeeId)
      .eq("effective_date", input.effectiveDate)
      .is("deleted_at", null);
    if (clearError) throw new Error(`Failed to save the rate: ${clearError.message}`);
    const { error } = await supabase.from("employee_pay_rates").insert({
      company_id: input.companyId,
      employee_id: input.employeeId,
      rate: input.rate,
      pay_type: input.payType,
      effective_date: input.effectiveDate,
      note: input.note?.trim() || null,
      created_by: actorId,
    });
    if (error) throw new Error(`Failed to save the rate: ${error.message}`);
    return resync(input.employeeId);
  }

  async function removePayRate(rateId: UUID, employeeId: UUID): Promise<number> {
    const actorId = await currentUserId();
    const { error } = await supabase
      .from("employee_pay_rates")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId })
      .eq("id", rateId);
    if (error) throw new Error(`Failed to remove the rate: ${error.message}`);
    return resync(employeeId);
  }

  async function listMyAssignedJobs(): Promise<AssignedJob[]> {
    const { data, error } = await supabase.rpc("my_assigned_jobs");
    if (error) throw new Error(`Failed to load your jobs: ${error.message}`);
    return (
      (data ?? []) as Array<{ id: string; estimate_number: string | null; title: string | null; completed: boolean; address?: string | null; project_name?: string | null; job_details?: string | null }>
    ).map((row) => ({
      id: row.id,
      estimateNumber: row.estimate_number,
      title: row.title,
      completed: row.completed,
      // Present once migration 20261029060000 has run.
      address: row.address ?? null,
      projectName: row.project_name ?? null,
      jobDetails: row.job_details ?? null,
    }));
  }

  async function listForEstimate(estimateId: UUID): Promise<Employee[]> {
    const { data, error } = await supabase
      .from("estimate_employees")
      .select("employee_id, employees(*)")
      .eq("estimate_id", estimateId);
    if (error) throw new Error(`Failed to load estimate employees: ${error.message}`);
    return (data ?? [])
      .map((row) => (row as unknown as { employees: EmployeeRow | null }).employees)
      .filter((e): e is EmployeeRow => !!e && !e.deleted_at)
      .map(rowToEmployee)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function assignToEstimate(input: { companyId: UUID; estimateId: UUID; employeeId: UUID }): Promise<void> {
    const { error } = await supabase.from("estimate_employees").insert({
      company_id: input.companyId,
      estimate_id: input.estimateId,
      employee_id: input.employeeId,
    });
    // Already assigned is not an error: the result is the same.
    if (error && error.code !== "23505") throw new Error(`Failed to assign employee: ${error.message}`);
  }

  async function unassignFromEstimate(input: { estimateId: UUID; employeeId: UUID }): Promise<void> {
    // Hours already recorded on this estimate keep the assignment in place,
    // so the labor cost always shows who did the work.
    const { count, error: countError } = await supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("estimate_id", input.estimateId)
      .eq("employee_id", input.employeeId)
      .is("deleted_at", null);
    if (countError) throw new Error(`Failed to check hours: ${countError.message}`);
    if ((count ?? 0) > 0) {
      throw new Error("This employee has hours recorded on this estimate, so they cannot be removed. Delete those hours first, or leave them assigned.");
    }

    // Job pay on this estimate goes with the assignment — unless it has
    // already been paid, in which case the payment needs it as its record.
    const { data: paid, error: paidError } = await supabase
      .from("payee_payments")
      .select("estimate_id, allocations")
      .eq("employee_id", input.employeeId)
      .eq("payment_kind", "pay")
      .is("reversed_at", null);
    if (paidError) throw new Error(`Failed to check payments: ${paidError.message}`);
    const paidOnThisJob = ((paid ?? []) as Array<{ estimate_id: string | null; allocations: Array<{ estimateId: string | null }> | null }>).some(
      (p) => p.estimate_id === input.estimateId || (p.allocations ?? []).some((a) => a.estimateId === input.estimateId)
    );
    if (paidOnThisJob) {
      throw new Error("This employee has already been paid for this estimate, so they cannot be removed. Reverse that payment in Payroll first, or leave them assigned.");
    }

    const { error: jobPayError } = await supabase
      .from("estimate_job_pay")
      .delete()
      .eq("estimate_id", input.estimateId)
      .eq("employee_id", input.employeeId);
    if (jobPayError) throw new Error(`Failed to remove job pay: ${jobPayError.message}`);

    const { error } = await supabase
      .from("estimate_employees")
      .delete()
      .eq("estimate_id", input.estimateId)
      .eq("employee_id", input.employeeId);
    if (error) throw new Error(`Failed to remove employee from estimate: ${error.message}`);
  }

  return {
    getById,
    getForProfile,
    listPayRates,
    changePayRate,
    removePayRate,
    listMyAssignedJobs,
    listMyTeamJobs,
    listAssignments,
    listJobPays,
    setJobPay,
    listMyJobPays,
    list,
    create,
    update,
    softDelete,
    listForEstimate,
    assignToEstimate,
    unassignFromEstimate,
  };
}
