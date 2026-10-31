# Bills page redesign (`/bills`)

Status: built 2026-10-29. Decisions: pay several bills from one vendor together; add `paid_on` + `paid_reference` (migration 20261029050000); nav renamed "Vendor bills". Duplicate fix and cleanup done (20261029030000).

## Bills vs Payroll

| | Payroll | Bills |
|---|---|---|
| Who | People who work jobs: employees, team, subs, agents | Companies that invoice us: suppliers, dumpster, rentals, insurance, utilities, software |
| Amount from | Assignment on the estimate | The vendor's invoice (amount, invoice #, due date) |
| One row = | A person, everything owed to them | One invoice from a vendor |
| Driven by | Pay period | Due date |
| Repeats | No | Yes (bill_schedules) |

Subtitle: "Invoices from suppliers and vendors · Crew, subs and agents → Payroll". The footer currently links to the old Payments page; drop it.

## Problems today

1. **Duplicate bills (bug, wrong totals).** `billScheduleService.generateDue` runs on every load. Two loads running at once each read the same `next_due_date` and each create the bill. Every recurring bill exists twice, so Outstanding shows $724 where the true figure is about $362.
2. Rows show "Miscellaneous" or "Recurring bill" instead of a vendor name.
3. Pay is one click: no date, method or ref #, and no undo.
4. No edit or delete, no job link, no paid date.
5. Old card and pill styling that doesn't match Payroll or the project page.

## Layout (same frame as Payroll)

- Header: title, the subtitle above, "+ Add bill".
- Ruled strip of labelled cells: Overdue $ · n | Due in 7 days | Upcoming | Paid this month. Clicking a cell filters the table.
- Tabs: Unpaid / Paid / Repeating / All, plus a Vendor filter and Search.
- Table with the green header tint. Columns: Vendor (with a "Monthly" tag if repeating), Invoice #, Job (link to the estimate or project), Category, Due (overdue shows days late in red), Amount, Pay. Unpaid rows are grouped Overdue / Due this week / Later.
- Clicking a row expands it in place: notes, bill date, Edit, Delete.
- Pay: an inline panel with paid date, method and check/ref #, then Confirm. Optionally "Pay selected" for several bills from the same vendor.
- Paid tab: adds Paid on, Method and Ref columns, plus "Undo payment" (red, with confirm).
- Repeating tab: compact table with Vendor, Amount, How often, Next due, Ends, Pause/Stop/Edit.
- Add bill: same fields as today; the project picker becomes a job (estimate) picker.
- Mobile: each row is two lines (vendor + amount / due · job · Pay). The strip becomes 2×2.

## Under the hood

- **Concurrency-safe generation:** the schedule advances with `.eq("next_due_date", old)`, and the bill is created only by the run that won the advance.
- **Cleanup SQL:** soft-delete the duplicate generated rows (same vendor, amount, due date, from a schedule). Show the rows to the user before running.
- **Paid date:** add a `paid_on date` column to `estimate_expenses` (migration).
- A bill stays one expense row, so no cost or profit math changes.

## Open decisions

1. "Pay selected" across several invoices from one vendor, or one at a time?
2. Add `paid_on`, or use the date it was marked paid?
3. Rename the nav item to "Vendor bills" so it isn't confused with Invoices?

Order: duplicate fix first, then the redesign.
