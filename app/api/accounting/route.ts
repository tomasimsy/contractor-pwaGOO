import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Test each view to ensure they exist
    const views = [
      'vw_monthly_pl',
      'vw_estimate_profit',
      'vw_expense_breakdown',
      'vw_top_clients',
      'vw_open_invoices',
      'vw_unsold_costs',
      'vw_mileage_ytd'
    ];

    for (const view of views) {
      const { error } = await supabase.from(view).select('*').limit(1);
      if (error) {
        console.error(`View ${view} error:`, error);
        return NextResponse.json(
          { error: `View "${view}" does not exist or is inaccessible. Please create it in Supabase.` },
          { status: 500 }
        );
      }
    }

    // Fetch all data
    const { data: monthly } = await supabase
      .from('vw_monthly_pl')
      .select('*')
      .limit(12);

    const { data: estimates } = await supabase
      .from('vw_estimate_profit')
      .select('*')
      .order('gross_profit', { ascending: false });

    const { data: expenseBreakdown } = await supabase
      .from('vw_expense_breakdown')
      .select('*');

    const { data: topClients } = await supabase
      .from('vw_top_clients')
      .select('*');

    const { data: openInvoices } = await supabase
      .from('vw_open_invoices')
      .select('*');

    const { data: unsoldCosts } = await supabase
      .from('vw_unsold_costs')
      .select('total_cost')
      .maybeSingle();

    const { data: mileage } = await supabase
      .from('vw_mileage_ytd')
      .select('total_miles, deduction')
      .maybeSingle();

    // Raw totals
    const { data: incomeTotals } = await supabase
      .from('estimates')
      .select('total')
      .eq('status', 'completed')
      .is('deleted_at', null);

    const totalIncome = incomeTotals?.reduce((sum, r) => sum + (r.total || 0), 0) || 0;

    const { data: expenseTotals } = await supabase
      .from('estimate_expenses')
      .select('amount')
      .is('deleted_at', null);

    const totalExpenses = expenseTotals?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;

    const netProfit = totalIncome - totalExpenses;

    // Alerts
    const alerts = [];
    const openInvoicesAmount = openInvoices?.reduce((s, inv) => s + inv.total, 0) || 0;
    if (openInvoicesAmount > 5000) {
      alerts.push({ type: 'warning', message: 'High accounts receivable (> $5,000) – follow up on open invoices.' });
    }
    if (netProfit < 0) {
      alerts.push({ type: 'danger', message: 'Net loss – review spending and income.' });
    }
    const totalMiles = mileage?.total_miles || 0;
    if (totalMiles > 1000) {
      alerts.push({ type: 'success', message: `Great mileage tracking: ${totalMiles.toFixed(0)} miles logged this year.` });
    }

    return NextResponse.json({
      summary: {
        totalIncome,
        totalExpenses,
        netProfit,
        totalMiles,
        mileageDeduction: mileage?.deduction || 0,
        unsoldCost: unsoldCosts?.total_cost || 0,
        openInvoicesCount: openInvoices?.length || 0,
        openInvoicesAmount,
      },
      monthly,
      estimates,
      expenseBreakdown,
      topClients,
      openInvoices,
      alerts,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}