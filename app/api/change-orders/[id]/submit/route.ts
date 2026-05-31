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

    const { data: existing } = await supabase
      .from('change_orders')
      .select('status')
      .eq('id', id)
      .single();

    if (!existing || existing.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft change orders can be submitted' }, { status: 400 });
    }

    const { error } = await supabase
      .from('change_orders')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}