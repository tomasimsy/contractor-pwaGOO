"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { ChangeOrderForm } from "@/components/changeOrders/ChangeOrderForm";
import { useServices } from "@/components/providers/ServicesProvider";
import type { ChangeOrder, ChangeOrderLineItem } from "@/lib/services/changeOrderService";

export default function EditChangeOrderPage() {
  const params = useParams();
  const changeOrderId = params.id as string;
  const { changeOrderService } = useServices();
  const [changeOrder, setChangeOrder] = useState<(ChangeOrder & { lineItems: ChangeOrderLineItem[] }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    changeOrderService.getById(changeOrderId).then((co) => {
      setChangeOrder(co);
      setLoading(false);
    });
  }, [changeOrderService, changeOrderId]);

  return (
    <RequirePermission resource="estimate" action="update">
      <PageContainer>
        <PageHeader title="Edit Change Order" />
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !changeOrder ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Change order not found.</div>
        ) : changeOrder.status !== "pending" && changeOrder.status !== "rejected" ? (
          <div className="rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
            This change order is already &ldquo;{changeOrder.status}&rdquo; and can no longer be edited.
          </div>
        ) : (
          <ChangeOrderForm changeOrder={changeOrder} lineItems={changeOrder.lineItems} />
        )}
      </PageContainer>
    </RequirePermission>
  );
}
