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

    const { data: existing } = await supabase
      .from('change_orders')
      .select('status, company_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    }

    if (existing.company_id !== auth.companyId) {
      return NextResponse.json({ error: 'Not authorized to submit this change order' }, { status: 403 });
    }

    if (existing.status !== 'draft') {
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