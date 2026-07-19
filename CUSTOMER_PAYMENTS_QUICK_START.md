# Customer Payments Feature - Quick Start (5 Minutes)

## ⚡ TL;DR - Just Want to Use It?

### Step 1: Apply Migration (2 min)

Copy this SQL and run it in **Supabase Dashboard → SQL Editor**:

```sql
ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS payment_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id_date ON public.invoice_payments(invoice_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_company_id ON public.invoice_payments(company_id, payment_date DESC);

CREATE OR REPLACE FUNCTION public.update_invoice_payment_totals() RETURNS TRIGGER AS $$
DECLARE total_paid NUMERIC; invoice_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_paid FROM public.invoice_payments 
  WHERE invoice_id = COALESCE(new.invoice_id, old.invoice_id) AND deleted_at IS NULL;
  SELECT total INTO invoice_total FROM public.invoices WHERE id = COALESCE(new.invoice_id, old.invoice_id);
  UPDATE public.invoices SET amount_paid = total_paid, remaining_balance = invoice_total - total_paid,
    payment_status = CASE WHEN total_paid = 0 THEN 'unpaid' WHEN total_paid >= invoice_total THEN 'paid' ELSE 'partial' END,
    status = CASE WHEN total_paid >= invoice_total THEN 'paid' ELSE status END,
    paid_at = CASE WHEN total_paid >= invoice_total THEN NOW() ELSE paid_at END
  WHERE id = COALESCE(new.invoice_id, old.invoice_id);
  RETURN COALESCE(new, old);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_invoice_payment_totals ON public.invoice_payments;
CREATE TRIGGER trg_update_invoice_payment_totals AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_invoice_payment_totals();
```

Click **RUN** → Done! ✅

### Step 2: Start Recording Payments (1 min)

**Option A: From Invoices List**
- Go to `/invoices`
- Click green `$` icon on any invoice
- Fill in payment details
- Click "Record Payment"

**Option B: From Invoice Detail**
- Go to `/invoices/[id]`
- Click `💰 Receive Payment` button
- Fill in payment details
- Click "Record Payment"

### Step 3: Verify It Works (1 min)

✅ Open invoice and check:
- Payment modal opens
- Can enter amount, date, method
- Can add reference number and notes
- Click "Record Payment"
- Invoice balance updates
- Payment status shows as "Paid" or "Partial"

## 🎯 What Each Button Does

| Location | Button | What It Does |
|----------|--------|------|
| Invoices List | Green `$` icon | Opens payment modal for that invoice |
| Invoice Detail | `💰 Receive Payment` | Opens payment modal with amount pre-filled |
| Payment Modal | "Record Payment" | Saves payment to database |
| Payment History | Delete icon | Removes payment (can be restored) |
| Payment History | Restore icon | Brings back deleted payment |

## 💡 Key Features

✅ Record partial payments (multiple payments per invoice)
✅ Track payment method (cash, check, ACH, etc.)
✅ Add reference numbers (check #, transaction ID)
✅ Add notes for each payment
✅ Automatic invoice total updates
✅ Delete/restore payments
✅ Overpayment warnings
✅ Real-time balance calculations

## 🔄 What Happens When You Record a Payment

1. You click "Record Payment" button
2. Modal opens with invoice pre-filled
3. You enter:
   - Amount received
   - Payment date (defaults to today)
   - Payment method
   - Reference number (optional)
   - Notes (optional)
4. Click "Record Payment"
5. **Automatically:**
   - Payment saved to database
   - Invoice `amount_paid` updates
   - Invoice `remaining_balance` recalculates
   - Invoice `payment_status` updates
   - Payment appears in payment history
   - UI refreshes instantly

## 📋 Default Values

| Field | Default |
|-------|---------|
| Amount | Remaining balance |
| Date | Today |
| Method | Bank Transfer |
| Reference | (empty) |
| Notes | (empty) |

## ⚠️ Troubleshooting

**Q: "Could not find 'payment_date' column" error**
A: Apply the SQL migration from Step 1 above

**Q: Payment button doesn't show**
A: Only appears on unpaid invoices. Check invoice status.

**Q: Payment saved but balance didn't update**
A: The trigger might not be created. Re-run the trigger SQL from Step 1.

**Q: Can't enter payment amount more than invoice total**
A: Shows warning "Overpaid by $XXX" - this is intentional but you can still save

## 🗂️ Files Changed

- ✅ `lib/queries/customerPayments.ts` - Payment operations
- ✅ `components/payments/ReceivedPaymentModal.tsx` - Payment form
- ✅ `components/payments/PaymentHistoryTable.tsx` - Payment history
- ✅ `components/payments/PaymentStatusCard.tsx` - Status display
- ✅ `app/invoices/page.tsx` - Added payment button
- ✅ `app/invoices/[id]/page.tsx` - Added payment button
- ✅ `lib/types.ts` - Added payment types
- ✅ `supabase/migrations/20260725000000_customer_payments_enhancements.sql` - Database changes

## 📊 Database Schema

Added to `invoice_payments` table:
- `payment_date` (DATE) - When payment was received
- `reference_number` (TEXT) - Check #, transaction ID, etc.
- `notes` (TEXT) - Payment notes

Existing columns used:
- `id` - Payment record ID
- `invoice_id` - Which invoice
- `amount` - Payment amount
- `method` - Cash, check, ACH, credit card, etc.
- `created_at` - When record was created
- `deleted_at` - For soft delete

## ✅ Testing Checklist

Run through these to verify everything works:

- [ ] Applied migration SQL successfully
- [ ] No errors in browser console
- [ ] Can see green `$` button on invoice list
- [ ] Can see `💰 Receive Payment` button on invoice detail
- [ ] Modal opens when clicking payment button
- [ ] Invoice details pre-filled correctly
- [ ] Can change payment amount
- [ ] Quick-select buttons (Full, 50%, 25%) work
- [ ] Can pick payment date
- [ ] Can select payment method
- [ ] Can add reference number
- [ ] Can add notes
- [ ] "Record Payment" button saves payment
- [ ] Invoice balance updates immediately
- [ ] Payment status changes to "Paid" or "Partial"
- [ ] Can see payment in payment history
- [ ] Can delete payment
- [ ] Deleted payment appears in deleted section
- [ ] Can restore deleted payment

## 🎓 Example Workflow

**Scenario**: Client paid $5,000 of $10,000 invoice via ACH (Ref: ACH-12345)

```
1. Go to /invoices
2. Find invoice #INV-001 ($10,000 total)
3. Click green $ icon
4. Modal opens showing:
   - Invoice #INV-001
   - Client: Acme Corp
   - Invoice Total: $10,000
   - Remaining: $10,000
5. Enter payment details:
   - Amount: $5,000 (use "50%" button)
   - Date: Today
   - Method: Bank Transfer / ACH
   - Reference: ACH-12345
   - Notes: Payment from client
6. Click "Record Payment"
7. Success! Invoice now shows:
   - Total: $10,000
   - Paid: $5,000
   - Remaining: $5,000
   - Status: PARTIAL
8. Payment appears in history
```

## 🚀 You're Ready!

The feature is fully integrated and ready to use. Start tracking customer payments today!

For more details, see `CUSTOMER_PAYMENTS_SETUP.md`
