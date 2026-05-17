"use client";

import { supabase } from "@/lib/supabase";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ConvertToInvoice() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    const convert = async () => {
      const { data: estimate } = await supabase
        .from("estimates")
        .select("*")
        .eq("id", id)
        .single();

      const { data: items } = await supabase
        .from("estimate_items")
        .select("*")
        .eq("estimate_id", id);

      const { data: invoice } = await supabase
        .from("invoices")
        .insert({
          estimate_id: id,
          client_id: estimate.client_id,
          total: estimate.total,
          status: "unpaid",
        })
        .select("id")
        .single();

      const invoiceId = invoice.id;

      const invoiceItems = items.map((i) => ({
        invoice_id: invoiceId,
        name: i.name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total: i.total,
      }));

      await supabase.from("invoice_items").insert(invoiceItems);

      router.push(`/invoices/${invoiceId}`);
    };

    convert();
  }, [id]);

  return <div>Converting to invoice…</div>;
}
