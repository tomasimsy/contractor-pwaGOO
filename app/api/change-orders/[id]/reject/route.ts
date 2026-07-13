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

    const { data: co, error: fetchError } = await supabase
      .from('change_orders')
      .select('status, company_id')
      .eq('id', id)
      .single();

    if (fetchError || !co) {
      return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
    }

    if (co.company_id !== auth.companyId) {
      return NextResponse.json({ error: 'Not authorized to reject this change order' }, { status: 403 });
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