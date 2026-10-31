# Employees and Timesheets — Design

Status: draft for review. Nothing here is built yet.
Date: 2026-10-16

## Intent

OSRPros needs to know who works for the company, how many hours each person
works on each job, and what that labor costs. Today the app has no record of
W-2 employees and no way to record hours. The payroll service has a payee
type for employees, but no tables and no pages behind it.

The owner's goal, in their words: add employees to the system, then have
hours entered for them either by the employee themselves or by a team member
on their behalf.

## Goals

1. Maintain a roster of employees (add, edit, deactivate).
2. Record timesheet entries per employee: date, hours, project, optional
   estimate, notes.
3. Entries can be created by the employee (if they have a login) or by a
   team member acting for them.
4. Show hours per project, so job cost can reflect labor.
5. Reuse existing patterns: service layer with Supabase and in-memory
   implementations, RLS, the permission matrix, the expense-row model for money.

## Non-goals (this version)

- Tax withholding, W-2 or W-4 handling, filing, or payroll tax deposits.
  The payroll service already says these need a provider or per-jurisdiction
  tables.
- GPS, photos, and break tracking on clock in and out. (Clock in and out itself
  is in scope; see "Clock in and out" below.)
- Paying employees from the app. Paying is an expense row, added later.
- Changing how subcontractors or sales agents are handled.

## Anti-goals (would be a failure even if it works)

- Counting hours as a cost on its own. Hours are not money. Cost appears only
  when a real labor expense row is written, as the team-assignment design
  already requires.
- Mixing employees with users, agents, or subcontractors. The Team page
  comment warns that these are separate sets of people, and conflating them
  breaks real data.
- Letting an employee see or edit another employee's hours.
- Making data entry slower on a phone than paper.

## Decided (from the conversation)

- An employee may or may not have a login. The roster must work without one.
- Hours can be entered by the employee (if they have a login) or by a team
  member acting for them.

## Design

### Data

`employees`
- id, company_id, name, phone, email, notes
- pay_type: `hourly` | `salary`
- base_rate (per hour, or per pay period for salary)
- pay_frequency: `weekly` | `biweekly` | `semimonthly` | `monthly`
- is_active
- profile_id (nullable): link to `profiles` when the employee has a login
- standard audit columns, deleted_at

`time_entries`
- id, company_id, employee_id
- work_date, hours (numeric, positive, max 24 per day per employee)
- estimate_id (the job the hours were spent on; nullable only for company time,
  see Rules)
- project_id: NOT stored. Read through `estimates.project_id`, so hours follow
  the estimate if it is moved to another project. Project totals are sums over
  entries whose estimate belongs to that project.
- notes
- entered_by (profiles.id), entered_at
- status: `submitted` (default) | `approved` (if approval is adopted, see
  open questions)
- audit columns, deleted_at

Rules
- One employee cannot have more than 24 hours on a single work date across all
  entries (enforced in the service, and by a check where practical).
- Editing or deleting an entry is recorded in the audit log, same as other
  services.
- Rate is read from the employee at entry time and stored on the entry, so a
  later raise does not rewrite past cost.
- Hours belong to an estimate. An entry with no estimate is "company time"
  (shop work, training, overhead). It counts in company totals but in no
  job's totals. Recorded as my call; see Calls below.
- Estimate hours: total hours per employee per estimate, and total hours per
  estimate, computed from approved entries (plus submitted entries shown
  separately).
- Project hours: the sum over all estimates on that project. A project with
  two estimates shows both estimates' hours and a combined total.

### Who can do what (permission matrix)

Add two resources to `lib/services/permissions.ts`: `employee` and
`time_entry`.

- `employee`: view and create for admin, office, project_manager. Update and
  deactivate for admin and office.
- `time_entry` for others: create, view for admin, office, project_manager
  (any employee); update and delete for admin and office. Approve for admin
  and office. `field_lead` and other roles cannot enter hours for others.
- An employee with a linked login may create and view only their own entries.
  This needs row-level security in addition to the matrix.

### Service layer

- `EmployeeService` and `TimeEntryService` as Layer 2 services with interface,
  Supabase implementation, and in-memory double.
- Wired into `lib/services/server.ts` and `components/providers/ServicesProvider.tsx`.
- `TimeEntryService` does not write money. Labor cost is written by a later
  step as an `estimate_expenses` row typed `labor`, tagged to the employee, as
  `teamAssignmentService.ts` already describes.

### Pages

- `/employees`: roster list, add and edit form, active or inactive filter.
  Matches the agents roster pattern.
- `/timesheets`: a standalone timesheet page, not part of any project or
  estimate page. Lists time entries for a chosen week, filterable by employee,
  project, and estimate. Shows the current user's own entries if they have a
  login, or the entries they entered for others.
- Entry form (on `/timesheets`, mobile first): pick employee, date, hours,
  notes, and the job. The job picker is two steps: choose a project, then an
  estimate on that project (or "Company time" for no estimate). The estimate
  list narrows to the chosen project. Large touch targets. Opens from the
  bottom nav.
- Each entry can be moved to a different estimate by editing it, subject to
  the same permissions.
- Estimate detail: a "Time" section listing hours per employee for this
  estimate, the total, and the submitted vs approved split. Same page area the
  team-member assignments already use.
- Project detail: hours summary per employee for the project, grouped by
  estimate, with a project total.

### Money and reporting (later step, not this version)

- Approved hours × rate → pay run lines in the existing payroll service, or
  `labor` expense rows, once a pay run is approved.
- Dashboard and reports read labor cost from expense rows only.

## Left to the builder

- Exact migration file names and timestamps (follow `supabase/migrations`).
- Form validation messages (match the existing expense form).
- Pagination and sorting for the roster and entries.

## Calls I made (review these)

- Employees get their own table, not a `profiles` row. Reason: most will not log in.
- Hours are stored with the rate at entry time. Reason: past cost must not change.
- Employees with a login see only their own entries. Reason: privacy of hours
  and pay.
- Hours cap at 24 per employee per day. Reason: basic sanity check.
- Clock in and out is in this version, done by a team member on the employee's
  behalf (owner's choice, 2026-10-21). Employees with no login do not clock in
  themselves.

## Decided by the owner

- Timesheet entries need approval before they count toward labor cost and
  pay. Entries start as `submitted`; an office user or admin moves them to
  `approved`. (Owner answered "yes".)

- Only office, admin, and project managers can enter hours for an employee.
  (Owner answered "only office/admin/managers".) An employee with a login can
  enter their own hours.

- Hours are tracked per estimate, and each estimate's hours are reported through
  its project. (Owner, 2026-10-16: "calculate the time for that employee for the
  project... own table but syncable through different projects".)

## Calls I made in this revision (review these)

- Entries link to the estimate, not the project. Reason: the owner wants hours
  per estimate, and estimates already belong to projects. Storing only the
  estimate means moving an estimate moves its hours with it, with no second
  copy to fix up.
- Entries with no estimate are "company time". Reason: shop work and training
  happen; forcing an estimate would make people invent one. Excluded from job
  totals.
- Estimate and project totals use approved entries for cost, and show submitted
  entries separately. Reason: matches the approval rule.

## Open questions for the owner

None, unless you want company time disallowed (every entry must have an estimate).

- A standalone `/timesheets` page is the main place to enter and review time.
  Each entry picks its project, then its estimate, or company time.
  (Owner, 2026-10-16: "a page for timesheet only, with option to select which
  project/estimate its belongs to".)

## Clock in and out (owner's choice, 2026-10-21)

Who does it: an office user, admin, or project manager clocks an employee in or
out. Employees without a login are not expected to use the app themselves.

Flow
1. Team member opens the employee (or the Time page) and taps **Clock in**.
2. They pick the job: a project, then one of its estimates, or company time.
3. The app creates an open time entry: employee, job, start time, entered_by,
   status `submitted`, rate copied from the employee. No end time yet.
4. **Clock out** on the same employee sets the end time. Hours are calculated
   from start to end (rounded to 0.01 hour) and saved on the same row.
5. Only one open entry per employee at a time. Clocking in again while open is
   refused with a message naming the open job.
6. A forgotten clock-out is fixed by an office user editing the end time, with
   a reason, recorded in the audit log.
7. Open entries older than 16 hours are flagged on the Time page for review.
   They are not closed automatically.

Storage: the same `time_entries` table. Add `started_at` and `ended_at`
(timestamps, nullable). `hours` is filled on clock out. Entries created as a
plain hours number leave both timestamps empty. Server time is the record.

Time zone: times are stored in UTC and displayed in the company's time zone.
Time zone comes from company settings. Confirm this setting exists before
building.

## Labor cost per project (how it reaches job cost)

Today a project's cost comes from expense rows (`estimate_expenses`), committed
subcontractor and agent amounts, and mileage. Employee labor has no cost source.

Decision: labor cost comes from **approved** time entries, not from separate
labor expense rows. This avoids entering the same money twice.

- Labor cost for an estimate = sum over its approved time entries of
  `hours × rate_at_entry`.
- A project's labor cost = the sum over its estimates (same rule as hours).
- It is one new line in the project and estimate cost totals, next to expenses,
  subcontractors, and agents. Nothing else in the cost formula changes.
- Submitted (not yet approved) hours show separately, as they do for hours.
- When payroll is built later, payments to employees are recorded against this
  labor cost, not added to it. The payroll step must not create a labor expense
  row for hours already counted here.
- Labor entered manually as an expense (`expense_type = labor` tagged to an
  employee) would double count. Rule: an employee's labor is counted once, from
  time entries. The expense form should refuse `labor` tagged to an employee,
  or show a warning. Decide which when building.

Reports: the company Dashboard, Reports, and CPA package read labor cost the
same way they read expenses (see the basis decision for expenses).

## Awaiting approval

This document now includes the per-estimate change, the standalone timesheet
page, clock in and out by a team member, and labor cost from approved time
entries. Nothing is built.

Two points to confirm before approval:
1. Labor cost counts approved hours only. Unapproved hours show separately.
   (Assumed; say if you want submitted hours counted too.)
2. Manual "labor" expense rows tagged to an employee: refuse them, or warn?
