# Pay period reconciliation

Purpose: prove that the Payroll page, the Accounting register, and the database
agree for one pay period. Run this before relying on the numbers.

Pick one period, for example Oct 13 – Oct 19, 2026. Replace the dates below.

## 1. Paid in the period (database)

Run in the Supabase SQL editor:

```sql
select payment_kind, count(*) as payments, sum(amount) as total
from public.payee_payments
where paid_on between '2026-10-13' and '2026-10-19'
  and reversed_at is null
group by payment_kind;
```

Expected: pay and reimbursement totals only. Adjustments are not cash, so they are
also shown here and should be checked separately.

## 2. Accounting register, Payroll filter

Open Accounting, set the date range to the same days, choose the **Payroll** filter,
and note the "Paid out" total.

It should equal: pay total + reimbursement total from step 1, plus any team pay
that is recorded as an expense in the same period (team payments are counted in
the expense lines, not the Payroll lines, so exclude them here).

## 3. Payroll page

Open Payroll, choose the period, and open each person. For each employee, the sum of
their payments with a period inside the chosen period should equal the pay paid
shown in the All payments table for that period.

## 4. Owed does not go negative

For every person: owed = earned − paid + corrections + pending reimbursements, never
below zero for the pay part. Check any negative value.

## 5. Locked hours

Try to edit one approved hour inside a paid period. The app must refuse it with the
"already been paid" message.

## Record the result

| Check | Expected | Actual | Pass |
|-------|----------|--------|------|
| 1. Database totals | | | |
| 2. Register Payroll total | | | |
| 3. Per-person totals | | | |
| 4. No negative owed | | | |
| 5. Locked hours refused | | | |
