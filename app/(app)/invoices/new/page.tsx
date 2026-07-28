"use client";

import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { InvoiceBuilder } from "@/components/invoices/InvoiceBuilder";

export default function NewInvoicePage() {
  return (
    <RequirePermission resource="invoice" action="create">
      <PageContainer>
        <PageHeader title="New Invoice" description="Bill a project directly, or generate from an approved estimate." />
        <InvoiceBuilder />
      </PageContainer>
    </RequirePermission>
  );
}
