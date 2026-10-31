# Migrations to run (in this order)

Run each file once, in order, in the Supabase SQL editor on a backup first.
Tick each one off after it runs. Do not skip any.

Recent work: employees, timesheets, job pay, payroll, and payments.

| # | File | Status |
|---|------|--------|
| 1 | 20261020000000_properties.sql | [ ] |
| 2 | 20261021000000_employees_timesheets.sql | [ ] |
| 3 | 20261021010000_restrict_employee_data.sql | [ ] |
| 4 | 20261021020000_employee_profile_fields.sql | [ ] |
| 5 | 20261021030000_employee_assigned_jobs.sql | [ ] |
| 6 | 20261021040000_team_list_hidden_from_employees.sql | [ ] |
| 7 | 20261021050000_team_member_crew_access.sql | [ ] |
| 8 | 20261022000000_employee_pay_type.sql | [ ] |
| 9 | 20261022010000_job_pay.sql | [ ] |
| 10 | 20261022020000_my_job_pays_status.sql | [ ] |
| 11 | 20261022030000_job_pay_mode.sql | [ ] |
| 12 | 20261022040000_jobs_completed_status.sql | [ ] |
| 13 | 20261023000000_payee_payments.sql | [ ] |
| 14 | 20261023010000_payment_kind.sql | [ ] |
| 15 | 20261023020000_pay_frequency_and_periods.sql | [ ] |
| 16 | 20261023030000_adjustments.sql | [ ] |

## After running
- Check that the Payroll page loads with no red error at the top.
- Check that an employee login can open My pay and cannot open Payroll.
- Run the checks in docs/PAY_PERIOD_RECONCILIATION.md.
