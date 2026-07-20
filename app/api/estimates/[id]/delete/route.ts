import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { deleteEstimate, archiveEstimate, estimateHasFinancialHistory } from "@/lib/queries/estimates";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: estimateId } = await params;
    const companyId = await getCompanyId();

    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!estimateId) {
      return NextResponse.json({ error: "Estimate ID required" }, { status: 400 });
    }

    // Check if estimate has financial history
    const hasHistory = await estimateHasFinancialHistory(estimateId, companyId);

    if (hasHistory) {
      // If it has financial history, return an error instructing to archive instead
      return NextResponse.json(
        {
          error: "Cannot delete estimate with financial records",
          suggestion: "Archive this estimate instead",
          hasFinancialHistory: true,
        },
        { status: 400 }
      );
    }

    // If no financial history, proceed with deletion
    const result = await deleteEstimate(estimateId, companyId);

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "Estimate deleted" });
  } catch (error: any) {
    console.error("Delete estimate error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete estimate" }, { status: 500 });
  }
}

/**
 * Archive an estimate instead of deleting it
 * Available for all estimates
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: estimateId } = await params;
    const companyId = await getCompanyId();

    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!estimateId) {
      return NextResponse.json({ error: "Estimate ID required" }, { status: 400 });
    }

    const result = await archiveEstimate(estimateId, companyId);

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "Estimate archived" });
  } catch (error: any) {
    console.error("Archive estimate error:", error);
    return NextResponse.json({ error: error.message || "Failed to archive estimate" }, { status: 500 });
  }
}
