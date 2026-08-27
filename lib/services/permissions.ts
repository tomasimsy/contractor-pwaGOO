/**
 * Layer 0 — the permission model. Pure data + a pure lookup function,
 * same pattern as schemaRegistry.ts: a role's allowed actions are
 * DATA (a matrix registered here), not an if/else chain scattered
 * across every service method. Adding a new role or a new resource
 * means editing PERMISSION_MATRIX, not rewriting service logic.
 *
 * Expanded from the original 5-role model (owner/manager/estimator/
 * accountant/agent) to the 7 roles the business actually has —
 * Admin/Office/Sales/ProjectManager/Accountant/Subcontractor/Agent —
 * per the "Enterprise Foundation" role list. Mapping from the old set,
 * for anything reading old code/docs: Admin = owner, Office = manager,
 * Sales = estimator, Accountant = accountant (unchanged), Agent =
 * agent (unchanged). Project Manager and Subcontractor are new — see
 * their design-intent notes below.
 *
 * This is ONE of three layers of enforcement, not the only one — see
 * RELIABILITY.md for the full defense-in-depth picture:
 *   1. Database (RLS policies keyed off profiles.role — see
 *      supabase/migrations/20260729000200_role_permissions.sql in
 *      contractor-pwa; that migration's constraint/values still use
 *      the old 5-role set and need updating to match this file — see
 *      ENTERPRISE_FOUNDATION.md's gap list)
 *   2. Service (ValidationService.validatePermission, called by every
 *      Layer 2 service's write methods, using this file)
 *   3. Application (components disable/hide actions the current role
 *      can't perform — see useCurrentRole in the hooks layer)
 * All three must independently deny an unauthorized action — the
 * service-level check existing does not mean the DB-level one is
 * skipped, and vice versa. A bug in one layer is a gap, not a hole,
 * only if the other two are also checked.
 */

export type Role =
  | "admin"
  | "office"
  | "sales"
  | "project_manager"
  | "accountant"
  | "subcontractor"
  | "agent"
  | "field_lead";

export const ROLES: Role[] = ["admin", "office", "sales", "project_manager", "accountant", "subcontractor", "agent", "field_lead"];

/** Every resource a permission can be scoped to. Kept as a closed
 * union (like SchemaRegistry entity names) so a typo in a resource
 * name is a compile error, not a silently-always-denied (or worse,
 * always-allowed) check. */
export type Resource =
  | "project" | "estimate" | "invoice" | "payment" | "expense"
  | "subcontractor_assignment" | "subcontractor_payment"
  | "agent_assignment" | "agent_payment"
  | "tax_settings" | "financial_reports" | "user_roles"
  | "audit_log" | "company_settings";

export type PermissionAction = "view" | "create" | "update" | "delete" | "approve";

type ResourcePermissions = Partial<Record<PermissionAction, boolean>>;

/**
 * The matrix. Read as "what can this role do to this resource." Missing
 * entries default to false (deny) — see `hasPermission`'s fallback —
 * so a newly-added resource that hasn't been given an explicit entry
 * for a role is denied by default, not silently allowed.
 *
 * Design intent per role (this is the part that's actually a business
 * decision, not architecture — revisit with the business owner before
 * shipping, this encodes a reasonable starting point):
 *   - Admin: full access to everything, including role management,
 *     company settings, and the audit log. Renamed from "owner."
 *   - Office: full day-to-day operational access (projects, estimates,
 *     invoices, payments, expenses, payables) but not tax settings,
 *     role management, or company settings — those are administrative
 *     controls, not day-to-day operations. Renamed from "manager."
 *   - Sales: creates/edits estimates and projects; can VIEW invoices/
 *     payments (needs to know what's been billed) but cannot create/
 *     delete them — billing is not their job. Renamed from "estimator."
 *   - Project Manager: operational owner of active jobs — full access
 *     to projects/expenses/subcontractor & agent assignments (the
 *     day-to-day of running a job site), can approve estimates/change
 *     orders, can VIEW invoices/payments (needs to know a job's
 *     billing status) but doesn't create/delete billing records —
 *     that's Office/Accountant's job, same boundary as Sales. New
 *     role, distinct from Sales (who sells the job) and Office (who
 *     bills it).
 *   - Accountant: full access to money movement (invoices, payments,
 *     expenses, payables, tax settings, financial reports, audit log)
 *     but cannot create/edit estimates (that's Sales, not accounting)
 *     and cannot manage user roles or company settings.
 *   - Subcontractor: view-only on their OWN assignment/payment data
 *     (enforced by RLS row scoping in addition to this action check —
 *     this matrix says "can a subcontractor view subcontractor_payment
 *     at all," the DB policy says "only their own rows"); no write
 *     access anywhere. New role — external party, same shape as Agent.
 *   - Agent: view-only on their own commission/reimbursement data,
 *     same row-scoping caveat as Subcontractor; no write access.
 */
const PERMISSION_MATRIX: Record<Role, Partial<Record<Resource, ResourcePermissions>>> = {
  admin: {
    project: { view: true, create: true, update: true, delete: true },
    estimate: { view: true, create: true, update: true, delete: true, approve: true },
    invoice: { view: true, create: true, update: true, delete: true },
    payment: { view: true, create: true, update: true, delete: true },
    expense: { view: true, create: true, update: true, delete: true },
    subcontractor_assignment: { view: true, create: true, update: true, delete: true },
    subcontractor_payment: { view: true, create: true, update: true, delete: true },
    agent_assignment: { view: true, create: true, update: true, delete: true },
    agent_payment: { view: true, create: true, update: true, delete: true },
    tax_settings: { view: true, create: true, update: true, delete: true },
    financial_reports: { view: true },
    user_roles: { view: true, create: true, update: true, delete: true },
    audit_log: { view: true },
    company_settings: { view: true, create: true, update: true, delete: true },
  },
  office: {
    project: { view: true, create: true, update: true, delete: true },
    estimate: { view: true, create: true, update: true, delete: true, approve: true },
    invoice: { view: true, create: true, update: true, delete: true },
    payment: { view: true, create: true, update: true, delete: true },
    expense: { view: true, create: true, update: true, delete: true },
    subcontractor_assignment: { view: true, create: true, update: true, delete: true },
    subcontractor_payment: { view: true, create: true, update: true, delete: true },
    agent_assignment: { view: true, create: true, update: true, delete: true },
    agent_payment: { view: true, create: true, update: true, delete: true },
    financial_reports: { view: true },
  },
  sales: {
    project: { view: true, create: true, update: true },
    estimate: { view: true, create: true, update: true, delete: true },
    invoice: { view: true },
    payment: { view: true },
    expense: { view: true, create: true },
    subcontractor_assignment: { view: true, create: true, update: true },
    agent_assignment: { view: true, create: true, update: true },
  },
  project_manager: {
    project: { view: true, create: true, update: true },
    estimate: { view: true, update: true, approve: true },
    invoice: { view: true },
    payment: { view: true },
    expense: { view: true, create: true, update: true, delete: true },
    subcontractor_assignment: { view: true, create: true, update: true, delete: true },
    subcontractor_payment: { view: true, create: true, update: true },
    agent_assignment: { view: true, create: true, update: true, delete: true },
    agent_payment: { view: true, create: true, update: true },
    financial_reports: { view: true },
  },
  accountant: {
    project: { view: true },
    estimate: { view: true },
    invoice: { view: true, create: true, update: true, delete: true },
    payment: { view: true, create: true, update: true, delete: true },
    expense: { view: true, create: true, update: true, delete: true },
    subcontractor_assignment: { view: true },
    subcontractor_payment: { view: true, create: true, update: true, delete: true },
    agent_assignment: { view: true },
    agent_payment: { view: true, create: true, update: true, delete: true },
    tax_settings: { view: true, create: true, update: true },
    financial_reports: { view: true },
    audit_log: { view: true },
  },
  subcontractor: {
    subcontractor_payment: { view: true },
    subcontractor_assignment: { view: true },
    project: { view: true },
  },
  agent: {
    agent_payment: { view: true },
    agent_assignment: { view: true },
    project: { view: true },
  },
  /** Runs one job on-site — not a full internal team member. This
   * matrix entry is the ACTION check ("can a field_lead view a
   * project at all") — row-level scoping ("only the one they're
   * assigned to") is a separate, later RLS piece, same caveat as
   * Subcontractor/Agent above. No write access anywhere. */
  field_lead: {
    project: { view: true },
    estimate: { view: true },
  },
};

/**
 * The one function every enforcement point (ValidationService,
 * application-level route/UI guards) calls. Pure, synchronous, no I/O
 * — permission is a property of (role, resource, action), never of
 * who's asking or what time it is, so it can be checked instantly and
 * identically everywhere, matching the same determinism discipline
 * FilteringService applies to filters.
 */
export function hasPermission(role: Role, resource: Resource, action: PermissionAction): boolean {
  return PERMISSION_MATRIX[role]?.[resource]?.[action] ?? false;
}

/** Throws with a clear, consistent message — the shape every service's
 * write method should call before doing anything else, so a denied
 * action fails loudly and identically everywhere instead of each
 * service inventing its own error text. */
export function assertPermission(role: Role, resource: Resource, action: PermissionAction): void {
  if (!hasPermission(role, resource, action)) {
    throw new Error(`Permission denied: role "${role}" cannot "${action}" on "${resource}".`);
  }
}
