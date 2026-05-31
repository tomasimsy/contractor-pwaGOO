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

    const { data: co, error: fetchError } = await supabase
      .from('change_orders')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError || !co) {
      return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    }

    if (co.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending change orders can be rejected' }, { status: 400 });
    }

    const { error } = await supabase
      .from('change_orders')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}