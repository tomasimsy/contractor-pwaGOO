"use client";

import { useParams } from "next/navigation";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { EstimateDetail } from "@/components/estimates/EstimateDetail";

export default function EstimateDetailPage() {
  const params = useParams();
  const estimateId = params.id as string;
  return (
    <RequirePermission resource="estimate" action="view">
      <EstimateDetail estimateId={estimateId} editBasePath="/estimates" />
    </RequirePermission>
  );
}
