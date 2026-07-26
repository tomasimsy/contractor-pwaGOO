"use client";

import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { EstimateForm } from "@/components/estimates/EstimateForm";

export default function NewEstimatePage() {
  return (
    <RequirePermission resource="estimate" action="create">
      <PageContainer>
        <PageHeader title="New Estimate" description="Create a proposal for a project." />
        <EstimateForm />
      </PageContainer>
    </RequirePermission>
  );
}
