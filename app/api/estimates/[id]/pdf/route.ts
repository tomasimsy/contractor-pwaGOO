import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pdfDocument } from "@/lib/pdf/pdfLayout";
import { loadEstimateProposalData, renderEstimateProposalHtml } from "@/lib/pdf/estimateProposal";

/**
 * PDF route for estimates — clean, minimalist contractor proposal
 * redesign. Data loading and HTML rendering both live in
 * lib/pdf/estimateProposal.ts, shared with the "Email Customer" send
 * flow (lib/email/sendEstimateEmail.ts) so a customer never receives
 * an emailed PDF that looks different from this preview.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const token = request.nextUrl.searchParams.get("token");
    const customerToken = request.nextUrl.searchParams.get("customerToken");

    // Three auth modes:
    //  - customerToken -> anon client, scoped to exactly one estimate by
    //    the query filter inside loadEstimateProposalData (public,
    //    no-login customer download).
    //  - token -> anon client + Bearer header (legacy staff link shape;
    //    kept working for any old link still in circulation).
    //  - neither -> cookie-based server client (the actual staff "Save
    //    as PDF" button). See app/api/reports/cpa-package/route.ts for
    //    the same pattern.
    const supabase = customerToken || token
      ? createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          token
            ? {
                global: {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                },
              }
            : undefined
        )
      : await createServerSupabaseClient();

    const data = await loadEstimateProposalData(supabase, id, { customerToken, origin: request.nextUrl.origin });
    if (!data) {
      return new NextResponse("Not found", { status: 404 });
    }

    const { docTitle, bodyHtml } = renderEstimateProposalHtml(data);
    const html = pdfDocument({ docTitle, bodyHtml });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error) {
    console.error("PDF error:", error);

    return new NextResponse(
      "Error generating PDF",
      { status: 500 }
    );
  }
}
