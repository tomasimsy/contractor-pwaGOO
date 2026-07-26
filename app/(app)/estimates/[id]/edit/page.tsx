"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { EstimateForm } from "@/components/estimates/EstimateForm";
import { useServices } from "@/components/providers/ServicesProvider";
import type { Estimate, EstimateLineItem } from "@/lib/services/estimateService";

export default function EditEstimatePage() {
  const params = useParams();
  const estimateId = params.id as string;
  const { estimateService } = useServices();
  const [estimate, setEstimate] = useState<(Estimate & { lineItems: EstimateLineItem[] }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    estimateService.getById(estimateId).then((e) => {
      setEstimate(e);
      setLoading(false);
    });
  }, [estimateService, estimateId]);

  return (
    <RequirePermission resource="estimate" action="update">
      <PageContainer>
        <PageHeader title="Edit Estimate" />
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !estimate ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Estimate not found.</div>
        ) : (
          <EstimateForm estimate={estimate} lineItems={estimate.lineItems} />
        )}
      </PageContainer>
    </RequirePermission>
  );
}
