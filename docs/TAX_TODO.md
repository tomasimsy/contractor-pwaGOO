# Payroll tax: to do (on hold)

Status: on hold. The Payroll page shows a placeholder. Nothing is calculated yet.

## Decided
- Taxes are calculated inside this app, not by an outside payroll provider.

## Needed before any real payroll runs
1. **Federal withholding tables** for the current year (IRS Publication 15-T),
   stored per year with the source and date recorded.
2. **Social Security and Medicare rates and wage base** for the current year,
   including the additional Medicare threshold.
3. **State income tax** for each state the company pays in, one state at a time.
4. **W-4 data per employee:** filing status, dependents, extra withholding.
5. **Withholding on each payment,** shown on the statement, with gross, taxes, and net.
6. **Employer taxes** (employer share of Social Security and Medicare, unemployment).
7. **Year-end forms:** W-2 for employees, 1099-NEC for team members paid as contractors.
8. **W-9 data** for team members (name, tax ID type, address).
9. **Verification:** check every table against IRS.gov and state sources, and have the
   accountant sign off before the first real payroll.
10. **Storage:** full SSNs are not stored in this database. Decide how they are
    entered and kept (encrypted store with the key outside the database).

## Not decided
- Which states the company pays in.
- Whether a team member is always a 1099 contractor, or can ever be an employee.
