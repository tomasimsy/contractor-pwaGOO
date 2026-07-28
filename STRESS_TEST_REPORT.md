# Stress & Edge-Case Test Report

**68 passed, 7 warnings, 0 failed** (75 checks total)

## Financial

- ✓ Partial payments sum to 800/1000, status partial — totalPaid=800, status=partial
- ✓ Overpayment rejected by default
- ✓ Overpayment accepted with allowOverpayment, status overpaid — status=overpaid
- ✓ Refund via payment deletion zeroes amountPaid — totalPaid=0
- ⚠ No first-class Refund concept — There is no RefundService/refund transaction type — a refund is modeled as soft-deleting the original payment. This is correct arithmetically (proven above) but means a refund has no independent record of ITS OWN (who authorized it, when, how) beyond the delete_reason string on the original payment.
- ✓ Negative change order reduces revisedTotal — approvedChangeOrderTotal=-800, revisedTotal=4200
- ✓ Negative change order still reconciles cleanly — []
- ✓ Only approved change orders (300+400=700) count, rejected 9999 excluded — approvedChangeOrderTotal=700
- ✓ Deposit exceeding total is rejected at creation
- ✓ Invoice total unchanged after estimate is edited post-conversion (invoice is a snapshot) — invoiceTotalBefore=1000, invoiceAfter=1000, estimateAfter=1000
- ⚠ No re-invoicing workflow for a post-conversion estimate change — If a contractor edits an estimate's tax/pricing after it's already been converted to an invoice, there is currently no service method that re-syncs or flags the now-diverged invoice — this test confirms the invoice correctly stays a fixed snapshot, but there's no alert surfaced anywhere that the source estimate has since changed.
- ✓ Over-discounted estimate computes a negative total, not NaN/throw — total=-440
- ⚠ No floor at zero for over-discounted totals — A discount exceeding subtotal+markup produces a negative estimate total ($-440) — mathematically consistent but no validation currently blocks a discount larger than the amount being discounted; worth a product decision on whether that should be allowed.
- ✓ Zero-dollar invoice does not crash getSummaryForInvoice
- ⚠ Zero-dollar invoice reports status "unpaid", not "paid" — derivePaymentStatus(0, 0) returns "unpaid" because its "paid" branch requires totalAmount > 0. A $0 invoice arguably has nothing left to collect and could reasonably show as fully paid instead — a semantic call for the business, not a calculation bug (the $0/$0 arithmetic itself is correct).
- ✓ Large-number estimate total is exact, not floating-point-corrupted — expected=987659877, actual=987659877
- ✓ Large-number invoice/payment figures are exact — invoicesTotal=987659877, amountPaid=500000000
- ✓ Subtotal equals Total with no adjustments — subtotal=4163.6, total=4163.6
- ✓ Total equals Revised Total with no approved change orders — total=4163.6, revisedTotal=4163.6
- ✓ Subtotal, Total, and Revised Total are all identical — subtotal=4163.6, total=4163.6, revisedTotal=4163.6
- ✓ Setup: total is contaminated relative to subtotal before the fix runs — total=5863.6, subtotal=4163.6
- ✓ Deleting a change order recalculates the estimate's total back to match its subtotal, self-healing legacy contamination — total=4163.6, subtotal=4163.6
- ✓ 1. Fresh estimate: total equals subtotal (no adjustments) — total=1000, subtotal=1000
- ✓ 2. Editing line items rebuilds total from current items only — total=2000
- ✓ 3. Approving a change order never changes base Total — total=2000
- ✓ 3. Approving a change order updates Revised Total to Total + amount — revised=2500
- ✓ 4. A pending change order affects neither Total nor Revised Total — total=2000, revised=2500
- ✓ 5. A rejected change order is excluded from Revised Total — revised=2500
- ✓ 6. Deleting the approved change order drops Revised Total back to Total — total=2000, revised=2000
- ✓ 7. Restoring the change order recovers Revised Total exactly — total=2000, revised=2500
- ✓ 8. A late line-item edit rebuilds Total from current items and Revised Total from the new Total — total=3000, revised=3500
- ✓ 1. Invoice created from an estimate must equal the estimate's Total exactly — asserted below after createFromEstimate
- ✓ 1. Invoice total equals the estimate's total at issue time — invoice.total=10000
- ✓ 2. Payment recorded successfully — []
- ✓ 2. Remaining balance after partial payment — remainingBalance=6000, status=partial
- ✓ 3. Approving a change order after invoicing never changes the invoice's total — total=10000
- ✓ 3. Approving a change order after invoicing never changes remaining balance — remainingBalance=6000
- ✓ 3. The approved change order DOES show up in the project's revised total — revisedTotal=11500
- ✓ 4. A rejected change order never affects the invoice total — total=10000
- ✓ 4. A rejected change order never affects the project's revised total — revisedTotal=11500
- ✓ 5. Deleting an approved change order never affects the invoice total — total=10000
- ✓ 5. Deleting an approved change order never affects remaining balance — remainingBalance=6000
- ✓ 5. Deleting an approved change order drops the project's revised total back — revisedTotal=10000
- ✓ 6. Invoice is fully paid after the second payment, rebuilt from both active payments — remainingBalance=0, status=paid

## CRUD

- ✓ Final amount after 5 rapid updates + 2 delete/restore cycles matches stored value — financials.expenseItems=150, stored=150
- ✓ Full history preserved: create + 5 updates = 6 ledger rows for this expense — trail.length=6
- ✓ Estimate reflects only the final edit (400), not a sum of all edits — total=400
- ✓ Estimate's revised total includes the approved change order before delete — revisedBefore=1250, estimate.total=1000
- ✓ Deleting an approved change order removes its revenue from project financials — before=250, afterDelete=0
- ✓ Deleting an approved change order removes its revenue from the estimate's revised total too — revisedAfterDelete=1000, estimate.total=1000
- ✓ Restoring re-includes the revenue in project financials — before=250, afterRestore=250
- ✓ Restoring re-includes the revenue in the estimate's revised total — revisedAfterRestore=1250, revisedBefore=1250
- ✓ Estimate is untouched after its parent project is deleted (no cascade)
- ⚠ No cascading soft-delete from Project to its children — After deleting project 42d25310-65d0-45a9-911e-3c5f6d4f4c58, its estimate/invoices/expenses remain active and FinancialEngine.getProjectFinancials still returns a full computation (revisedTotal=0) for a project that no longer shows up in ProjectService.list(). This is orphaned-but-still-active data — worth an explicit product decision on whether project deletion should cascade or block if children exist.

## Concurrency

- ✓ Concurrent line-item edit + status change both land without throwing
- ⚠ No optimistic locking on estimate edits — Two concurrent writers (one editing line items to $500, one changing status to "sent") both succeeded silently — the final line items are ["user-A-edit"]. There is no version/etag check, so a real second user's simultaneous edit can be silently overwritten with no conflict warning to either user.
- ✓ Simultaneous overlapping payments correctly resolve to a consistent, non-corrupted total — totalPaid=1400, status=overpaid
- ✓ All 5 concurrently-created expenses are present (no lost writes) — found 5 of 5
- ✓ Both concurrently-approved change orders (111+222=333) are reflected — delta=333

## Data Integrity

- ✓ No duplicate estimate numbers across 5 concurrent creations — numbers=["EST-2","EST-3","EST-4","EST-5","EST-6"]
- ⚠ Estimate number scheme is not concurrency-safe by construction — estimateNumber is generated as EST-${store.estimates.size + 1} — a count-based scheme. This test passed only because this in-memory fake happens to run each create() call's synchronous portion to completion before yielding; a real database-backed implementation using the equivalent "SELECT count(*) then use count+1" pattern WOULD produce duplicate numbers under real concurrent writers. A production implementation needs a DB sequence or a unique constraint with retry, not a count.
- ✓ No duplicate invoice numbers across concurrent conversions — numbers=["INV-2","INV-3","INV-4","INV-5"]
- ✓ Every payment.invoiceId resolves to a real invoice
- ✓ Every expense.projectId resolves to a real project
- ✓ Every ledger row's (referenceType, referenceId) resolves to a real record
- ✓ No orphan estimates/invoices/change-orders/assignments

## Cross-page

- ✓ Dashboard === Reports === Project page (same call, same result)
- ✓ Estimates page total is the proposal figure, independent of but consistent with revenue inputs
- ✓ Invoices page total matches Dashboard's invoicesTotal
- ✓ Expenses page total matches Dashboard's expenseItems
- ✓ Tax page's taxableRevenue matches company financials' totalRevenue (same cash-basis source)
- ✓ Customer page's totalInvoiced matches Dashboard's invoicesTotal
- ✓ Agent page outstanding matches Dashboard's outstandingAgent
- ✓ Subcontractor page outstanding matches Dashboard's outstandingSubcontractor
- ✓ Full reconciliation sweep is clean across every page's data source — []

## Every inconsistency found

- ⚠ **[Financial]** No first-class Refund concept: There is no RefundService/refund transaction type — a refund is modeled as soft-deleting the original payment. This is correct arithmetically (proven above) but means a refund has no independent record of ITS OWN (who authorized it, when, how) beyond the delete_reason string on the original payment.
- ⚠ **[Financial]** No re-invoicing workflow for a post-conversion estimate change: If a contractor edits an estimate's tax/pricing after it's already been converted to an invoice, there is currently no service method that re-syncs or flags the now-diverged invoice — this test confirms the invoice correctly stays a fixed snapshot, but there's no alert surfaced anywhere that the source estimate has since changed.
- ⚠ **[Financial]** No floor at zero for over-discounted totals: A discount exceeding subtotal+markup produces a negative estimate total ($-440) — mathematically consistent but no validation currently blocks a discount larger than the amount being discounted; worth a product decision on whether that should be allowed.
- ⚠ **[Financial]** Zero-dollar invoice reports status "unpaid", not "paid": derivePaymentStatus(0, 0) returns "unpaid" because its "paid" branch requires totalAmount > 0. A $0 invoice arguably has nothing left to collect and could reasonably show as fully paid instead — a semantic call for the business, not a calculation bug (the $0/$0 arithmetic itself is correct).
- ⚠ **[CRUD]** No cascading soft-delete from Project to its children: After deleting project 42d25310-65d0-45a9-911e-3c5f6d4f4c58, its estimate/invoices/expenses remain active and FinancialEngine.getProjectFinancials still returns a full computation (revisedTotal=0) for a project that no longer shows up in ProjectService.list(). This is orphaned-but-still-active data — worth an explicit product decision on whether project deletion should cascade or block if children exist.
- ⚠ **[Concurrency]** No optimistic locking on estimate edits: Two concurrent writers (one editing line items to $500, one changing status to "sent") both succeeded silently — the final line items are ["user-A-edit"]. There is no version/etag check, so a real second user's simultaneous edit can be silently overwritten with no conflict warning to either user.
- ⚠ **[Data Integrity]** Estimate number scheme is not concurrency-safe by construction: estimateNumber is generated as EST-${store.estimates.size + 1} — a count-based scheme. This test passed only because this in-memory fake happens to run each create() call's synchronous portion to completion before yielding; a real database-backed implementation using the equivalent "SELECT count(*) then use count+1" pattern WOULD produce duplicate numbers under real concurrent writers. A production implementation needs a DB sequence or a unique constraint with retry, not a count.
