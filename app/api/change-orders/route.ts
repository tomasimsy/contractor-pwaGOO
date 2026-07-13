import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { estimate_id, title, description } = body;

    if (!estimate_id || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: estimate, error: estError } = await supabase
      .from('estimates')
      .select('total')
      .eq('id', estimate_id)
      .single();

    if (estError || !estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }

    const { count } = await supabase
      .from('change_orders')
      .select('id', { count: 'exact', head: true })
      .eq('estimate_id', estimate_id)
      .is('deleted_at', null);

    const coNumber = `CO-${(count || 0) + 1}`;

    const { data, error } = await supabase
      .from('change_orders')
      .insert({
        estimate_id,
        change_order_number: coNumber,
        title,
        description: description || null,
        original_estimate_total: estimate.total,
        total_amount: 0,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}