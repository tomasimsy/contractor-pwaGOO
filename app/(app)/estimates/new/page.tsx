"use client";

import { PageContainer } from "@/components/ui/PageContainer";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { EstimateForm } from "@/components/estimates/EstimateForm";

export default function NewEstimatePage() {
  return (
    <RequirePermission resource="estimate" action="create">
      <PageContainer className="sm:px-0 sm:py-0 lg:px-0">
        <EstimateForm layout="document" />
      </PageContainer>
    </RequirePermission>
  );
}
