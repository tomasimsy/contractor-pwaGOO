"use client";

import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { EstimateForm } from "@/components/estimates/EstimateForm";

/** Temporary trial: everything on one page, sections without card boxes. Same form and saving as /estimates-roof/new. */
export default function NewEstimateRoofFlatPage() {
  return (
    <RequirePermission resource="estimate" action="create">
      <PageContainer>
        <PageHeader title="New Roofing Estimate" description="Create a roofing proposal for a project." />
        <EstimateForm roofV2 basePath="/estimates-roof" layout="flat" />
      </PageContainer>
    </RequirePermission>
  );
}
