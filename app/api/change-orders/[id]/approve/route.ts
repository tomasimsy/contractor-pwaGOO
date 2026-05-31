import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<any> }
) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { signature } = await request.json();

    const { data: co, error: fetchError } = await supabase
      .from('change_orders')
      .select('*, estimate_id, total_amount')
      .eq('id', id)
      .single();

    if (fetchError || !co) {
      return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
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

    // Note: The frontend will recalculate the estimate total by summing approved change orders.
    // You can optionally update the estimate.total column here if you prefer.

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}