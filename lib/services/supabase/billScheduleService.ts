/**
 * Supabase-backed BillScheduleService. See the interface for why a
 * schedule is a rule and not a cost.
 *
 * `generateDue` deliberately writes through ExpenseService.create rather
 * than inserting into `estimate_expenses` directly: the generated bill
 * must be identical to a hand-entered one — same defaults, same
 * category trigger, same audit row, same soft-delete discipline. Going
 * around the service would be a second way to create an expense.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  advanceBillDate,
  type BillSchedule,
  type BillScheduleCreateInput,
  type BillScheduleService,
  type BillFrequency,
} from "../billScheduleService";
import type { ExpenseService, ExpenseType } from "../expenseService";
import type { ValidationService } from "../validationService";
import type { UUID } from "../types";

const SELECT =
  "id, company_id, project_id, vendor, amount, expense_type, notes, frequency, interval_count, start_date, next_due_date, end_date, max_occurrences, occurrences_generated, is_active, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by, delete_reason";

interface Row {
  id: string;
  company_id: string;
  project_id: string | null;
  vendor: string | null;
  amount: number | string | null;
  expense_type: string;
  notes: string | null;
  frequency: string;
  interval_count: number;
  start_date: string;
  next_due_date: string;
  end_date: string | null;
  max_occurrences: number | null;
  occurrences_generated: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

function rowToSchedule(row: Row): BillSchedule {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    vendor: row.vendor,
    amount: Number(row.amount ?? 0),
    expenseType: row.expense_type as ExpenseType,
    notes: row.notes,
    frequency: row.frequency as BillFrequency,
    intervalCount: row.interval_count,
    startDate: row.start_date,
    nextDueDate: row.next_due_date,
    endDate: row.end_date,
    maxOccurrences: row.max_occurrences,
    occurrencesGenerated: row.occurrences_generated,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    deleteReason: row.delete_reason,
  } as BillSchedule;
}

export function createSupabaseBillScheduleService(
  supabase: SupabaseClient,
  expenseService: ExpenseService,
  validationService: ValidationService,
  currentUserId: () => Promise<UUID | null>
): BillScheduleService {
  async function listForCompany(companyId: UUID): Promise<BillSchedule[]> {
    const { data, error } = await supabase
      .from("bill_schedules")
      .select(SELECT)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("next_due_date", { ascending: true });
    if (error) throw new Error(`Failed to load bill schedules: ${error.message}`);
    return ((data ?? []) as Row[]).map(rowToSchedule);
  }

  async function create(input: BillScheduleCreateInput): Promise<BillSchedule> {
    if (input.amount < 0) throw new Error("A recurring bill amount cannot be negative.");
    const actorId = await currentUserId();
    const { data, error } = await supabase
      .from("bill_schedules")
      .insert({
        company_id: input.companyId,
        project_id: input.projectId ?? null,
        vendor: input.vendor?.trim() || null,
        amount: input.amount,
        expense_type: input.expenseType ?? "miscellaneous",
        notes: input.notes?.trim() || null,
        frequency: input.frequency,
        interval_count: input.intervalCount ?? 1,
        start_date: input.startDate,
        // The first occurrence is due on the start date itself.
        next_due_date: input.startDate,
        end_date: input.endDate ?? null,
        max_occurrences: input.maxOccurrences ?? null,
        created_by: actorId,
        updated_by: actorId,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(`Failed to create recurring bill: ${error.message}`);
    return rowToSchedule(data as Row);
  }

  async function update(
    scheduleId: UUID,
    changes: Partial<{ amount: number; vendor: string | null; notes: string | null; isActive: boolean; endDate: string | null }>
  ): Promise<BillSchedule> {
    const actorId = await currentUserId();
    const payload: Record<string, unknown> = { updated_by: actorId };
    if (changes.amount !== undefined) payload.amount = changes.amount;
    if (changes.vendor !== undefined) payload.vendor = changes.vendor?.trim() || null;
    if (changes.notes !== undefined) payload.notes = changes.notes?.trim() || null;
    if (changes.isActive !== undefined) payload.is_active = changes.isActive;
    if (changes.endDate !== undefined) payload.end_date = changes.endDate;

    const { data, error } = await supabase
      .from("bill_schedules")
      .update(payload)
      .eq("id", scheduleId)
      .select(SELECT)
      .single();
    if (error) throw new Error(`Failed to update recurring bill: ${error.message}`);
    return rowToSchedule(data as Row);
  }

  async function softDelete(scheduleId: UUID, reason: string): Promise<void> {
    const validation = validationService.validateDeleteReason(reason);
    if (!validation.valid) {
      throw new Error(validation.issues[0]?.message ?? "A delete reason is required.");
    }
    const actorId = await currentUserId();
    const { error } = await supabase
      .from("bill_schedules")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actorId, delete_reason: reason })
      .eq("id", scheduleId);
    if (error) throw new Error(`Failed to delete recurring bill: ${error.message}`);
  }

  async function generateDue(companyId: UUID, asOf?: string): Promise<number> {
    const today = asOf ?? new Date().toISOString().slice(0, 10);
    const schedules = (await listForCompany(companyId)).filter((s) => s.isActive);
    let created = 0;

    for (const s of schedules) {
      let due = s.nextDueDate;
      let generated = s.occurrencesGenerated;

      // Catch up on every occurrence that has come due, not just the
      // most recent — a schedule untouched for three months should
      // produce three bills, not one.
      while (
        due <= today &&
        (!s.endDate || due <= s.endDate) &&
        (s.maxOccurrences === null || generated < s.maxOccurrences)
      ) {
        // ONE ordinary expense row, through the same service every other
        // entry point uses. Non-null dueDate is what makes it a Bill.
        await expenseService.create({
          companyId,
          projectId: s.projectId ?? null,
          expenseType: s.expenseType,
          amount: s.amount,
          expenseDate: due,
          dueDate: due,
          vendor: s.vendor,
          payeeType: s.vendor ? "vendor" : null,
          paidByType: "company",
          // A bill starts life unpaid — that is the entire point.
          isPaid: false,
          reimbursable: false,
          notes: s.notes,
        });
        created += 1;
        generated += 1;
        due = advanceBillDate(due, s.frequency, s.intervalCount);
      }

      if (due !== s.nextDueDate) {
        const exhausted =
          (!!s.endDate && due > s.endDate) ||
          (s.maxOccurrences !== null && generated >= s.maxOccurrences);
        const { error } = await supabase
          .from("bill_schedules")
          .update({
            next_due_date: due,
            occurrences_generated: generated,
            // Stop a finished schedule rather than re-checking it daily.
            is_active: !exhausted,
          })
          .eq("id", s.id);
        if (error) throw new Error(`Failed to advance recurring bill: ${error.message}`);
      }
    }

    return created;
  }

  return { listForCompany, create, update, softDelete, generateDue };
}
