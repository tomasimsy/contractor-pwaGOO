import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<any> }
) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data, error } = await supabase
      .from('change_orders')
      .select('*, change_order_line_items(*)')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<any> }
) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const body = await request.json();
    const { title, description, line_items, total_amount } = body;

    const { data: existing } = await supabase
      .from('change_orders')
      .select('status')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (!existing || existing.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft change orders can be edited' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('change_orders')
      .update({
        title,
        description,
        total_amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    if (line_items) {
      await supabase.from('change_order_line_items').delete().eq('change_order_id', id);
      const itemsToInsert = line_items.map((item: any) => ({
        change_order_id: id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.quantity * item.unit_price,
        type: item.type || 'addition',
      }));
      if (itemsToInsert.length) {
        const { error: itemsError } = await supabase.from('change_order_line_items').insert(itemsToInsert);
        if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
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
      .is('deleted_at', null)
      .single();

    if (!existing || existing.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft change orders can be deleted' }, { status: 400 });
    }

    const { error } = await supabase.from('change_orders').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}