import { NextRequest, NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { supabase } from "@/lib/supabase/client";
import InvoicePDF from "@/components/pdf/InvoicePDF";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log("Generating PDF for invoice:", params.id);
    
    // Load invoice data
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", params.id)
      .single();

    if (invoiceError) {
      console.error("Invoice error:", invoiceError);
      return new NextResponse("Invoice not found", { status: 404 });
    }

    // Load client
    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", invoice.client_id)
      .single();

    // Load items
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", params.id);

    // Load payments
    const { data: payments } = await supabase
      .from("invoice_payments")
      .select("*")
      .eq("invoice_id", params.id);

    // Generate PDF
    // const stream = await renderToStream(
    //   <InvoicePDF 
    //     invoice={invoice} 
    //     client={client || {}} 
    //     items={items || []}
    //     payments={payments || []}
    //     signature={invoice.signature}
    //   />
    // );

    return new NextResponse(stream as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=invoice-${params.id}.pdf`,
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return new NextResponse("Error generating PDF: " + (error as Error).message, { status: 500 });
  }
}