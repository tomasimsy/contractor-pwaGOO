"use client";

import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { EstimateForm } from "@/components/estimates/EstimateForm";

export default function NewEstimateRoofPage() {
  return (
    <RequirePermission resource="estimate" action="create">
      <PageContainer>
        <PageHeader title="New Roofing Estimate" description="Create a roofing proposal for a project." />
        <EstimateForm roofV2 basePath="/estimates-roof" />
      </PageContainer>
    </RequirePermission>
  );
}
