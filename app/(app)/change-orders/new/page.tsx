"use client";

import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { ChangeOrderForm } from "@/components/changeOrders/ChangeOrderForm";

export default function NewChangeOrderPage() {
  return (
    <RequirePermission resource="estimate" action="create">
      <PageContainer>
        <PageHeader title="New Change Order" description="Propose a scope change against an estimate." />
        <ChangeOrderForm />
      </PageContainer>
    </RequirePermission>
  );
}
