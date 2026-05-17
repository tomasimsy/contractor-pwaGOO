import { NextRequest, NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { supabase } from "@/lib/supabase/client";
import InvoicePDF from "@/components/pdf/InvoicePDF";
import React from "react";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: invoice } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .single();

    if (!invoice) {
      return new NextResponse("Not found", { status: 404 });
    }

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", invoice.client_id)
      .single();

    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", id);

    const pdfStream = await renderToStream(
      React.createElement(InvoicePDF, {
        invoice: invoice,
        client: client || {},
        items: items || [],
      })
    );

    return new NextResponse(pdfStream as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=invoice-${id}.pdf`,
      },
    });
  } catch (error) {
    console.error("PDF error:", error);
    return new NextResponse("Error generating PDF", { status: 500 });
  }
}