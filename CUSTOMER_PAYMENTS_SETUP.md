# Customer Payments Feature - Setup Guide

## 📋 Overview

The Customer Payments feature allows you to track and record payments received from customers for invoices. This guide explains how to set up the feature and apply necessary database migrations.

## 🚀 Quick Start

### Step 1: Apply the Database Migration

The feature requires adding new columns to the `invoice_payments` table. Apply this migration to your Supabase database:

**File**: `supabase/migrations/20260725000000_customer_payments_enhancements.sql`

#### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project at https://app.supabase.com
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the SQL from the migration file
5. Click **RUN**
6. Verify the success message

#### Option B: Using Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g @supabase/cli

# Link your project
supabase link --project-ref your-project-ref

# Push migrations
supabase push
```

#### Option C: Manual SQL Execution

If you have direct database access, execute this SQL:

```sql
-- Add new columns to invoice_payments table
ALTER TABLE public.invoice_payments 
ADD COLUMN IF NOT EXISTS payment_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE public.invoice_payments 
ADD COLUMN IF NOT EXISTS reference_number TEXT;

ALTER TABLE public.invoice_payments 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id_date 
ON public.invoice_payments(invoice_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_company_id 
ON public.invoice_payments(company_id, payment_date DESC);

-- Create automatic payment totals update function
CREATE OR REPLACE FUNCTION public.update_invoice_payment_totals()
RETURNS TRIGGER AS $$
DECLARE
  total_paid NUMERIC;
  invoice_total NUMERIC;
BEGIN
  -- Calculate total paid (excluding deleted payments)
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.invoice_payments
  WHERE invoice_id = COALESCE(new.invoice_id, old.invoice_id)
    AND deleted_at IS NULL;

  -- Get the invoice total
  SELECT total INTO invoice_total
  FROM public.invoices
  WHERE id = COALESCE(new.invoice_id, old.invoice_id);

  -- Update the invoice with new payment totals
  UPDATE public.invoices
  SET
    amount_paid = total_paid,
    remaining_balance = invoice_total - total_paid,
    payment_status = CASE
      WHEN total_paid = 0 THEN 'unpaid'
      WHEN total_paid >= invoice_total THEN 'paid'
      ELSE 'partial'
    END,
    status = CASE
      WHEN total_paid >= invoice_total THEN 'paid'
      ELSE status
    END,
    paid_at = CASE
      WHEN total_paid >= invoice_total THEN NOW()
      ELSE paid_at
    END
  WHERE id = COALESCE(new.invoice_id, old.invoice_id);

  RETURN COALESCE(new, old);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic updates
DROP TRIGGER IF EXISTS trg_update_invoice_payment_totals ON public.invoice_payments;
CREATE TRIGGER trg_update_invoice_payment_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoice_payment_totals();
```

### Step 2: Use the Feature

After applying the migration, the Customer Payments feature is ready to use!

#### Access Points:

**Invoices List Page** (`/invoices`)
- Click the green **$ icon** on any pending invoice
- Opens payment recording modal

**Invoice Detail Page** (`/invoices/[id]`)
- Click **💰 Receive Payment** button
- Opens payment recording modal with invoice details pre-filled

#### Recording a Payment:

1. **Select Payment Amount**
   - Use quick-select buttons (Full, 50%, 25%)
   - Or enter custom amount

2. **Choose Payment Date**
   - Defaults to today
   - Can select any date

3. **Select Payment Method**
   - Bank Transfer / ACH
   - Check
   - Credit Card
   - Cash
   - Zelle
   - Wire Transfer
   - Other

4. **Add Reference Number** (Optional)
   - Check number
   - Transaction ID
   - Reference code

5. **Add Notes** (Optional)
   - Any relevant payment information

6. **Click "Record Payment"**
   - Payment saved instantly
   - Invoice balance updates automatically
   - Modal closes and page refreshes

## 🔧 Features

✅ **Partial Payments** - Support unlimited payments per invoice
✅ **Payment History** - View all payments for each invoice
✅ **Edit/Delete Payments** - Modify or remove payments
✅ **Automatic Calculations** - Invoice totals sync via database trigger
✅ **Real-Time Updates** - No page refresh needed
✅ **Soft Deletes** - Payments can be restored
✅ **Overpayment Detection** - Warns when paying more than invoice total
✅ **Company Scoped** - Data isolated by authenticated user's company

## 📊 Components Added

### React Components
- `components/payments/ReceivedPaymentModal.tsx` - Payment recording form
- `components/payments/PaymentHistoryTable.tsx` - Payment history display
- `components/payments/PaymentStatusCard.tsx` - Payment status visualization

### Query Module
- `lib/queries/customerPayments.ts` - All payment database operations

### Type Definitions
- `lib/types.ts` - `InvoicePaymentRow`, `InvoicePaymentStatus` types

### Updated Pages
- `app/invoices/page.tsx` - Added payment button to invoice list
- `app/invoices/[id]/page.tsx` - Added payment button to invoice detail

## 🐛 Troubleshooting

### Error: "Could not find the 'payment_date' column"

**Solution**: The migration hasn't been applied yet. Follow the steps in "Apply the Database Migration" above.

### Error: "Column 'reference_number' does not exist"

**Solution**: Same as above - apply the migration.

### Modal Opens But Payment Doesn't Save

1. Check browser console for errors (F12)
2. Verify user is authenticated
3. Verify invoice ID is correct
4. Check Supabase project logs
5. Ensure migration has been applied

### Payment Records But Invoice Total Doesn't Update

The trigger might not have been created. Re-run this SQL:

```sql
DROP TRIGGER IF EXISTS trg_update_invoice_payment_totals ON public.invoice_payments;
CREATE TRIGGER trg_update_invoice_payment_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoice_payment_totals();
```

## 📋 API Reference

### recordCustomerPayment(input)

```typescript
await recordCustomerPayment({
  invoiceId: "inv_123",
  companyId: "comp_456",
  amount: 1500,
  paymentMethod: "bank_transfer",
  paymentDate: "2026-07-18",
  referenceNumber: "TXN-12345",
  notes: "Payment received from client"
});
```

### getInvoicePayments(invoiceId)

```typescript
const payments = await getInvoicePayments("inv_123");
```

### getInvoicePaymentSummary(invoiceId)

```typescript
const summary = await getInvoicePaymentSummary("inv_123");
// Returns: { invoiceId, invoiceTotal, totalPaid, remainingBalance, status, payments }
```

### getAccountsReceivable(companyId)

```typescript
const ar = await getAccountsReceivable("comp_456");
// Returns total outstanding invoice balance
```

### getOverdueInvoices(companyId)

```typescript
const overdue = await getOverdueInvoices("comp_456");
// Returns invoices past due with unpaid balance
```

## 🎯 Database Schema

### invoice_payments Table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| invoice_id | uuid | Foreign key to invoices |
| company_id | uuid | Company scope |
| amount | numeric | Payment amount |
| method | text | Cash, Check, ACH, etc. |
| payment_date | date | Date of payment (NEW) |
| reference_number | text | Check #, transaction ID (NEW) |
| notes | text | Payment notes (NEW) |
| created_at | timestamp | Creation timestamp |
| deleted_at | timestamp | Soft delete marker |

### Automatic Updates

The `update_invoice_payment_totals` trigger automatically updates on the invoices table:
- `amount_paid` = SUM of all active payments
- `remaining_balance` = total - amount_paid
- `payment_status` = unpaid/partial/paid
- `status` = marks invoice as "paid" when fully paid
- `paid_at` = timestamp when payment completes

## ✅ Testing Checklist

- [ ] Migration applied successfully
- [ ] No errors in browser console
- [ ] Can click payment button on invoice list
- [ ] Can click payment button on invoice detail
- [ ] Payment modal opens with correct invoice data
- [ ] Can record a payment
- [ ] Invoice balance updates after payment
- [ ] Payment appears in payment history
- [ ] Can edit payment details
- [ ] Can delete a payment
- [ ] Deleted payment can be restored
- [ ] Overpayment shows warning
- [ ] Multiple payments work for same invoice
- [ ] Payment status badge updates correctly

## 📞 Support

If you encounter issues:

1. **Check Migration Status**
   - Go to Supabase Dashboard
   - SQL Editor
   - Run: `SELECT * FROM information_schema.columns WHERE table_name='invoice_payments';`
   - Verify `payment_date`, `reference_number`, `notes` columns exist

2. **Check Browser Console**
   - Press F12
   - Look for error messages
   - Copy any error and check database logs

3. **Verify User Authentication**
   - Ensure user is logged in
   - Check that profile.company_id is set

4. **Check Supabase Logs**
   - Go to Supabase Dashboard
   - Database section
   - Check recent queries for errors

## 🎉 You're All Set!

The Customer Payments feature is now ready to use. Start recording payments from the Invoices page or Invoice detail page.
