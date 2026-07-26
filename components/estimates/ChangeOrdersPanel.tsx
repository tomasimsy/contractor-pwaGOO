"use client";

/**
 * Lists a project's change orders (any status) and lets staff approve
 * a pending one. Approving is the ONE action here with a financial
 * consequence (books "change_order_approved" revenue to the ledger —
 * see ChangeOrderService.approveChangeOrder's doc comment) and it is
 * entirely inside the service call; this component never touches the
 * ledger, never recomputes a total, and never decides what "approved"
 * should do besides call the service.
 *
 * Uses useAsyncResource for loading/error state — this panel
 * previously rendered nothing at all while fetching and swallowed any
 * fetch failure silently (found during the optimization pass).
 */
import { useState } from "react";
import { useServices } from "../../lib/services-context";
import { useAsyncResource } from "../../lib/hooks/useAsyncResource";
import { LoadingState, ErrorState } from "../shared/AsyncStates";
import type { ChangeOrder } from "../../lib/services";

export function ChangeOrdersPanel({ projectId }: { projectId: string }) {
  const { changeOrderService } = useServices();
  const { data: changeOrders, loading, error, reload } = useAsyncResource<ChangeOrder[]>(
    () => changeOrderService.listForProject(projectId),
    [changeOrderService, projectId]
  );
  const [approvingId, setApprovingId] = useState<string | null>(null);

  if (loading) return <LoadingState label="Loading change orders..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <h3 className="font-semibold">Change Orders</h3>
      {!changeOrders || changeOrders.length === 0 ? (
        <p className="py-2 text-sm text-gray-500">No change orders yet.</p>
      ) : (
        <ul className="divide-y">
          {changeOrders.map((co) => (
            <li key={co.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {co.changeOrderNumber} — {co.title} — ${co.totalAmount.toFixed(2)} ({co.status})
              </span>
              {co.status === "pending" && (
                <button
                  type="button"
                  disabled={approvingId === co.id}
                  className="self-start sm:self-auto"
                  onClick={async () => {
                    setApprovingId(co.id);
                    try {
                      await changeOrderService.approveChangeOrder(co.id);
                      reload();
                    } finally {
                      setApprovingId(null);
                    }
                  }}
                >
                  {approvingId === co.id ? "Approving..." : "Approve"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
