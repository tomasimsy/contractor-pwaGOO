"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { InvoiceBuilder } from "@/components/invoices/InvoiceBuilder";
import { useServices } from "@/components/providers/ServicesProvider";
import type { Invoice, InvoiceLineItem } from "@/lib/services/invoiceService";

export default function EditInvoicePage() {
  const params = useParams();
  const invoiceId = params.id as string;
  const { invoiceService } = useServices();
  const [invoice, setInvoice] = useState<(Invoice & { lineItems: InvoiceLineItem[] }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoiceService.getById(invoiceId).then((i) => {
      setInvoice(i);
      setLoading(false);
    });
  }, [invoiceService, invoiceId]);

  return (
    <RequirePermission resource="invoice" action="update">
      <PageContainer>
        <PageHeader title="Edit Invoice" />
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !invoice ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Invoice not found.</div>
        ) : invoice.lifecycleStatus !== "draft" ? (
          <div className="rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
            This invoice is &ldquo;{invoice.status.replace(/_/g, " ")}&rdquo; — its financial values are locked and can no longer be edited.
            Void it and issue a new one if a correction is needed.
          </div>
        ) : (
          <InvoiceBuilder invoice={invoice} lineItems={invoice.lineItems} />
        )}
      </PageContainer>
    </RequirePermission>
  );
}
