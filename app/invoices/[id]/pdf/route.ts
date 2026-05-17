import { NextRequest, NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import EstimatePDF from "@/components/pdf/EstimatePDF";
import { supabase } from "@/lib/supabase/client";
import React from "react";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log("Generating PDF for estimate:", params.id);

    // Load estimate
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .select("*")
      .eq("id", params.id)
      .single();

    if (estimateError) {
      console.error("Estimate error:", estimateError);
      return new NextResponse("Estimate not found", { status: 404 });
    }

    // Load client
    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", estimate.client_id)
      .single();

    // Load items
    const { data: items } = await supabase
      .from("estimate_items")
      .select("*")
      .eq("estimate_id", params.id);

    // Load company settings
    let company_name = "One Square Roof LLC";
    let company_address = "Charlotte, North Carolina";
    let company_phone = "(704) 303-4112";
    let company_email = "onesquareroof@gmail.com";
    let deposit_percentage = 50;

    const { data: settings } = await supabase
      .from("company_settings")
      .select("*")
      .single();

    if (settings) {
      company_name = settings.company_name || company_name;
      company_address = settings.company_address || company_address;
      company_phone = settings.company_phone || company_phone;
      company_email = settings.company_email || company_email;
      deposit_percentage = settings.default_deposit_percentage || deposit_percentage;
    }

    // Generate PDF
    const stream = await renderToStream(
      React.createElement(EstimatePDF, {
        estimate: estimate,
        client: client || {},
        items: items || [],
        signature: estimate.signature,
        company_name: company_name,
        company_address: company_address,
        company_phone: company_phone,
        company_email: company_email,
        deposit_percentage: deposit_percentage,
      })
    );

    return new NextResponse(stream as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=estimate-${params.id}.pdf`,
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