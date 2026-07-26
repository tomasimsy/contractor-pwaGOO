/**
 * Layer 3 — makes "every create, update, or delete must trigger
 * validation" true WITHOUT threading a manual reconciliation call into
 * every single method of every Layer 2 service (which would be the
 * same "remember to call the shared thing everywhere" failure mode
 * that let contractor-pwa's 15 calculation sites drift in the first
 * place — the fix can't itself depend on nobody forgetting a step).
 *
 * `withAutoReconciliation` wraps any Layer 2 service object in a
 * Proxy: after a call to a method whose name matches a mutating verb
 * (create/update/delete/restore/record/approve/assign/recordPayment/
 * changeStatus/recalculateTotal/recordSignature/lock/updateLineItems),
 * it resolves the project the mutation affected and calls
 * `ReconciliationService.reconcileAfterMutation` — reusing that
 * service's existing detect/log/recalculate logic entirely; this file
 * contains no reconciliation logic of its own, only the wiring that
 * guarantees it always runs.
 *
 * `resolveProjectId` is the one per-service piece of configuration:
 * different services' methods take/return the project id in different
 * shapes (an expense's create() input has `projectId` directly; a
 * payment's record() only has an `invoiceId`, so the wrapper needs to
 * look the invoice up). It is deliberately the ONLY thing that varies
 * per service — the triggering logic itself does not.
 */
import type { InvoiceService } from "./invoiceService";
import type { ReconciliationService, MutationTrigger } from "./reconciliationService";

const MUTATING_METHOD_PATTERN =
  /^(create|update|softDelete|restore|record|approve|assign|changeStatus|recalculateTotal|recordSignature|lock)/i;

export interface AutoReconciliationOptions<T extends object> {
  entityTable: string;
  /** Given the method name, its arguments, and its resolved return
   * value, figure out which project the mutation affected — return
   * null if it can't be determined (e.g. a read-only method slipped
   * through the name pattern, or a company-level record with no
   * project). Async because some services need to look up a related
   * record (e.g. resolve a payment's invoice to find its project). */
  resolveProjectId(methodName: keyof T, args: unknown[], result: unknown): Promise<string | null>;
}

export function withAutoReconciliation<T extends object>(
  service: T,
  reconciliationService: ReconciliationService,
  options: AutoReconciliationOptions<T>
): T {
  return new Proxy(service, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== "function" || typeof prop !== "string" || !MUTATING_METHOD_PATTERN.test(prop)) {
        return original;
      }

      return async function (...args: unknown[]) {
        const result = await original.apply(target, args);

        // A method that returns a ValidationResult with valid: false
        // didn't actually mutate anything (e.g. changeStatus rejecting
        // an illegal transition) — nothing to reconcile.
        if (result && typeof result === "object" && "valid" in result && (result as { valid: boolean }).valid === false) {
          return result;
        }

        const projectId = await options.resolveProjectId(prop as keyof T, args, result);
        if (projectId) {
          const action = (
            prop.startsWith("create") || prop === "assignToProject" || prop === "record"
              ? "create"
              : prop.startsWith("softDelete")
                ? "delete"
                : prop.startsWith("restore")
                  ? "restore"
                  : "update"
          ) as MutationTrigger["action"];

          await reconciliationService.reconcileAfterMutation(projectId, {
            entityTable: options.entityTable,
            entityId: (result as { id?: string })?.id ?? "unknown",
            action,
          });
        }

        return result;
      };
    },
  });
}

/** Resolves a projectId by looking up an invoiceId through
 * InvoiceService — shared by PaymentService and anything else whose
 * mutations are scoped by invoice rather than project directly. */
export function resolveProjectIdViaInvoice(invoiceService: InvoiceService) {
  return async (invoiceId: string | undefined): Promise<string | null> => {
    if (!invoiceId) return null;
    const invoice = await invoiceService.getById(invoiceId);
    return invoice?.projectId ?? null;
  };
}
