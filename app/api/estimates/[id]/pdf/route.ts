import { NextRequest, NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { supabase } from "@/lib/supabase/client";
import EstimatePDF from "@/components/pdf/EstimatePDF";

export async function GET(
req: NextRequest,
{ params }: { params: { id: string } }
) {
try {
// Load estimate data
const { data: estimate } = await supabase
.from("estimates")
.select("*")
.eq("id", params.id)
.single();

if (!estimate) {
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

// Generate PDF
const stream = await renderToStream(
<EstimatePDF estimate={estimate} client={client} items={items || []} signature={estimate.signature} />
);

return new NextResponse(stream as any, {
headers: {
"Content-Type": "application/pdf",
"Content-Disposition": `attachment; filename=estimate-${params.id}.pdf`,
},
});
} catch (error) {
console.error("PDF generation error:", error);
return new NextResponse("Error generating PDF", { status: 500 });
}
}