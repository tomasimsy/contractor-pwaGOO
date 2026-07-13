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

    // Keep estimates.total in sync with the same formula used
    // everywhere else this total is recomputed (originalSubtotal +
    // approvedChangeOrdersTotal — see approve_public_change_order RPC
    // and the Estimate/Invoice pages' live recalculation). The
    // frontend recomputes live and was never affected by this being
    // stale, but list/dashboard views that read estimates.total
    // directly need it kept current too.
    const [{ data: items }, { data: approvedCOs }] = await Promise.all([
      supabase
        .from('estimate_items')
        .select('total')
        .eq('estimate_id', co.estimate_id)
        .eq('company_id', auth.companyId)
        .is('deleted_at', null),
      supabase
        .from('change_orders')
        .select('total_amount')
        .eq('estimate_id', co.estimate_id)
        .eq('company_id', auth.companyId)
        .eq('status', 'approved')
        .is('deleted_at', null),
    ]);
    const newTotal =
      (items || []).reduce((sum, i) => sum + (i.total || 0), 0) +
      (approvedCOs || []).reduce((sum, c) => sum + (c.total_amount || 0), 0);
    await supabase
      .from('estimates')
      .update({ total: newTotal })
      .eq('id', co.estimate_id)
      .eq('company_id', auth.companyId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}