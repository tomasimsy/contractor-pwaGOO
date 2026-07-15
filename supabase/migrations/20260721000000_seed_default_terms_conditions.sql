-- Backfills the requested Terms & Conditions text for every company that
-- hasn't customized it yet, so it shows up on estimates/invoices/PDFs
-- immediately (companies can still override it later from Settings).

update public.company_settings
set terms_conditions = $TC$Valid for 30 days from date issued
50% deposit required to begin, balance due upon completion
Changes must be approved in writing (additional charges may apply)
Client must provide safe access to work areas
Client responsible for marking underground lines, irrigation, drain lines, low-voltage wires, and hidden utilities
Contractor not liable for damage from unmarked underground items
Warranty excludes: weather, tree roots, drainage, soil movement, customer neglect, or third-party work
NC residential jobs: cancellation rights per state and federal law
Schedule may be affected by weather, material delays, or hidden conditions
Debris cleanup limited to approved scope of work$TC$
where terms_conditions is null or terms_conditions = '';
