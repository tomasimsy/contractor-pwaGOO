/**
 * Layer 2 — owns `employees` (W-2 staff, separate from logins, agents and
 * subcontractors) and `estimate_employees` (which employees are assigned to
 * an estimate).
 *
 * Owns identity, pay rate and assignments only. It does not own hours or
 * money: hours live in TimeEntryService, and labor cost is derived from
 * approved hours there.
 *
 * Who may do what is enforced by row-level security (see the migration
 * 20261021000000_employees_timesheets.sql) and by the permission matrix in
 * permissions.ts. This service does not re-check roles.
 */
import type { PayRate } from "../payRates";
import type { UUID, AuditedEntity, QueryScope } from "./types";
import type { PayType } from "./timeEntryService";
import type { JobPayMode } from "./jobPay";

/** Personal and employment details that belong on an employee profile. Every
 * field is optional except the name. */
export interface EmployeeProfileFields {
  name: string;
  phone: string | null;
  email: string | null;
  jobTitle: string | null;
  /** YYYY-MM-DD */
  hireDate: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  /** Two-letter state code, e.g. "TX". */
  addressState: string | null;
  addressZip: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  /** Last four digits of the SSN. The full number is never sent to or stored by the app. */
  ssnLast4: string | null;
  notes: string | null;
  /** Company employee number, e.g. EMP-0001. Assigned automatically when an
   * employee is created; the office can change it. Optional for older fixtures. */
  employeeNumber?: string | null;
}

export interface Employee extends AuditedEntity, EmployeeProfileFields {
  /** The employee's login, when they have one. Null = no app access. */
  profileId: UUID | null;
  /** Hourly rate, or the day rate when payType is 'daily'. Copied onto each time
   * entry when it is made, so changing it later does not change past labor cost. */
  hourlyRate: number;
  /** 'hourly': rate per hour. 'daily': fixed rate per day worked. */
  payType: PayType;
  /** How often this person is paid: pay periods are weekly or every two weeks. */
  payFrequency: "weekly" | "biweekly";
  isActive: boolean;
}

export interface CreateEmployeeInput extends Partial<EmployeeProfileFields> {
  companyId: UUID;
  name: string;
  hourlyRate?: number;
  payType?: PayType;
  payFrequency?: "weekly" | "biweekly";
  profileId?: UUID | null;
}

export type UpdateEmployeeInput = Partial<Omit<EmployeeProfileFields, "name">> &
  Partial<Pick<Employee, "name" | "hourlyRate" | "payType" | "payFrequency" | "profileId" | "isActive">>;

/** A job an employee can clock in to: its id plus the name shown on screen. */
export interface AssignedJob {
  id: UUID;
  estimateNumber: string | null;
  title: string | null;
  /** True when the job's project is marked completed. */
  completed?: boolean;
  /** Where the job is — shown to the employee with a Directions link. */
  address?: string | null;
  projectName?: string | null;
  /** The estimate's description: the scope of work. */
  jobDetails?: string | null;
}

export interface EmployeeService {
  /** `includeDeleted` defaults to false. */
  getById(employeeId: UUID, includeDeleted?: boolean): Promise<Employee | null>;
  /** The employee record linked to a login, or null. Used to find "me". */
  getForProfile(profileId: UUID): Promise<Employee | null>;
  list(scope: QueryScope): Promise<Employee[]>;
  create(input: CreateEmployeeInput): Promise<Employee>;
  update(employeeId: UUID, changes: UpdateEmployeeInput): Promise<Employee>;
  /** Requires a reason, same as ClientService.softDelete. */
  softDelete(employeeId: UUID, reason: string): Promise<void>;

  /** For an employee login: the jobs it is assigned to, by name only. Never the estimate itself. */
  listMyAssignedJobs(): Promise<AssignedJob[]>;
  /** For a team member: the estimates they supervise, by name only. */
  listMyTeamJobs(): Promise<AssignedJob[]>;

  /** Job pay on an estimate: a fixed amount for finishing it, instead of hourly. */
  listJobPays(companyId: UUID): Promise<Array<{ estimateId: UUID; employeeId: UUID; amount: number; mode: JobPayMode }>>;
  /** Sets (or with null, removes) the job pay for one employee on one estimate. */
  setJobPay(input: { companyId: UUID; estimateId: UUID; employeeId: UUID; amount: number | null; mode?: JobPayMode }): Promise<void>;
  /** For an employee login: its own job pays, by estimate. */
  listMyJobPays(): Promise<Array<{ estimateId: UUID; amount: number; completed: boolean; mode: JobPayMode }>>;

  /** Every crew assignment in the company (employee on estimate), for the Crew page. */
  listAssignments(companyId: UUID): Promise<Array<{ estimateId: UUID; employeeId: UUID }>>;

  /** Employees assigned to one estimate. */
  listForEstimate(estimateId: UUID): Promise<Employee[]>;
  assignToEstimate(input: { companyId: UUID; estimateId: UUID; employeeId: UUID }): Promise<void>;
  unassignFromEstimate(input: { estimateId: UUID; employeeId: UUID }): Promise<void>;

  /** Pay rate history, newest first. An employee can read their own. */
  listPayRates(employeeId: UUID): Promise<PayRate[]>;
  /** Adds a rate starting on a date (replacing one already set for that same
   * date), then brings every UNPAID time entry in line with the history.
   * Returns how many entries changed. Paid hours keep their rate. */
  changePayRate(input: { companyId: UUID; employeeId: UUID; rate: number; payType: "hourly" | "daily"; effectiveDate: string; note?: string | null }): Promise<number>;
  /** Removes a rate (e.g. a raise scheduled by mistake) and re-applies the history to unpaid hours. */
  removePayRate(rateId: UUID, employeeId: UUID): Promise<number>;
}
