import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireCompanyUser } from '@/lib/api/requireCompanyUser';

export async function POST(
  request: Request,
  { params }: { params: Promise<any> }
) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });

    const auth = await requireCompanyUser(supabase);
    if (!auth.ok) return auth.response;

    // Fetch change order with line items and estimate
    const { data: co, error: coError } = await supabase
      .from('change_orders')
      .select('*, change_order_line_items(*), estimate:estimates(*)')
      .eq('id', id)
      .is('deleted_at', null)
      .filter('change_order_line_items.deleted_at', 'is', null)
      .single();

    if (coError || !co) {
      return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    }

    if (co.company_id !== auth.companyId) {
      return NextResponse.json({ error: 'Not authorized to invoice this change order' }, { status: 403 });
    }

    if (co.status !== 'approved') {
      return NextResponse.json({ error: 'Only approved change orders can be invoiced' }, { status: 400 });
    }

    // Check if already invoiced
    const { data: existingInvoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('change_order_id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingInvoice) {
      return NextResponse.json({ error: 'Invoice already generated for this change order' }, { status: 400 });
    }

    // Create invoice
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .insert({
        company_id: auth.companyId,
        client_id: co.estimate.client_id,
        estimate_id: co.estimate_id,
        change_order_id: id,
        invoice_number: `INV-${co.change_order_number}`,
        subtotal: co.total_amount,
        total: co.total_amount,
        remaining_balance: co.total_amount,
        status: 'pending',
        issue_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      })
      .select()
      .single();

    if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });

    // Add line items to invoice
    const invoiceItems = co.change_order_line_items.map((item: any) => ({
      invoice_id: invoice.id,
      company_id: auth.companyId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total,
    }));

    if (invoiceItems.length) {
      const { error: itemsError } = await supabase.from('invoice_items').insert(invoiceItems);
      if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Mark change order as invoiced
    await supabase
      .from('change_orders')
      .update({ status: 'invoiced' })
      .eq('id', id);

    return NextResponse.json({ invoiceId: invoice.id });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}