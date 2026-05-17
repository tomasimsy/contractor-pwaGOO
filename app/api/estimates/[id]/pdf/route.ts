import { NextRequest, NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { supabase } from "@/lib/supabase/client";
import EstimatePDF from "@/components/pdf/EstimatePDF";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: estimate } = await supabase
      .from("estimates")
      .select("*")
      .eq("id", id)
      .single();

    if (!estimate) {
      return new NextResponse("Not found", { status: 404 });
    }

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", estimate.client_id)
      .single();

    const { data: items } = await supabase
      .from("estimate_items")
      .select("*")
      .eq("estimate_id", id);

    // Create the PDF element
    const pdfElement = EstimatePDF({ estimate, client: client || {}, items: items || [] });
    
    const pdfStream = await renderToStream(pdfElement);

    return new NextResponse(pdfStream as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=estimate-${id}.pdf`,
      },
    });
  } catch (error) {
    console.error("PDF error:", error);
    return new NextResponse("Error generating PDF", { status: 500 });
  }
}