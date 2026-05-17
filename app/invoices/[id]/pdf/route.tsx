import { NextRequest, NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import InvoicePDF from "@/components/pdf/InvoicePDF";
import { supabase } from "@/lib/supabase/client";
import React from "react";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log("Generating PDF for invoice:", params.id);

    // Load invoice
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

    // Load company settings
    let company_name = "One Square Roof LLC";
    let company_address = "Charlotte, North Carolina";
    let company_phone = "(704) 303-4112";
    let company_email = "onesquareroof@gmail.com";

    const { data: settings } = await supabase
      .from("company_settings")
      .select("*")
      .single();

    if (settings) {
      company_name = settings.company_name || company_name;
      company_address = settings.company_address || company_address;
      company_phone = settings.company_phone || company_phone;
      company_email = settings.company_email || company_email;
    }

    // Generate PDF using React.createElement
    const stream = await renderToStream(
      React.createElement(InvoicePDF, {
        invoice: invoice,
        client: client || {},
        items: items || [],
        payments: payments || [],
        signature: invoice.signature,
        company_name: company_name,
        company_address: company_address,
        company_phone: company_phone,
        company_email: company_email,
      })
    );

    return new NextResponse(stream as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=invoice-${params.id}.pdf`,
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return new NextResponse(
      "Error generating PDF: " + (error as Error).message,
      { status: 500 }
    );
  }
}