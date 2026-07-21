import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireCompanyUser } from '@/lib/api/requireCompanyUser';
import { cascadeRevisedTotalToInvoices, computeRevisedEstimateTotal } from '@/lib/queries/changeOrders';

export async function POST(
  request: Request,
  { params }: { params: Promise<any> }
) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });

    const auth = await requireCompanyUser(supabase);
    if (!auth.ok) return auth.response;

    const { signature } = await request.json();

    const { data: co, error: fetchError } = await supabase
      .from('change_orders')
      .select('*, estimate_id, total_amount, company_id')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchError || !co) {
      return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    }

    if (co.company_id !== auth.companyId) {
      return NextResponse.json({ error: 'Not authorized to approve this change order' }, { status: 403 });
    }

    if (co.status !== 'pending') {
      return NextResponse.json({ error: 'Change order is not pending approval' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('change_orders')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        signed_signature: signature,
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Keep estimates.total in sync using the same shared formula every
    // other approval path uses (items + markup/discount/tax + approved
    // change orders — see lib/queries/changeOrders.ts). This route used
    // to carry its own truncated copy (items + COs only, no markup/
    // discount/tax) and never cascaded the result to an already-
    // generated invoice, which is exactly what let a customer-signed
    // public change order leave the invoice's total/remaining_balance
    // stale indefinitely.
    const { revisedTotal: newTotal } = await computeRevisedEstimateTotal(co.estimate_id, auth.companyId, supabase as any);
    await supabase
      .from('estimates')
      .update({ total: newTotal })
      .eq('id', co.estimate_id)
      .eq('company_id', auth.companyId);
    await cascadeRevisedTotalToInvoices(co.estimate_id, auth.companyId, newTotal, supabase as any);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}