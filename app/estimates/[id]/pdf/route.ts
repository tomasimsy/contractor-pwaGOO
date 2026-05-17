import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { renderToStream } from "@react-pdf/renderer";
import EstimatePDF from "@/components/pdf/EstimatePDF";

export async function GET(
request: NextRequest,
context: { params: { id: string } | Promise<{ id: string }> }
  ) {
  const { id } = await context.params;

  if (!id) {
  return NextResponse.json(
  { error: "Missing estimate id in route params" },
  { status: 400 }
  );
  }

  const { data: estimate, error } = await supabase
  .from("estimates")
  .select("*")
  .eq("id", id)
  .single();

  if (error || !estimate) {
  return NextResponse.json(
  { error: "Estimate not found", details: error?.message },
  { status: 404 }
  );
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

  const stream = await renderToStream(
  React.createElement(EstimatePDF, {
  estimate,
  client,
  items: items || [],
  })
  );

  return new NextResponse(stream as any, {
  headers: {
  "Content-Type": "application/pdf",
  },
  });
  }