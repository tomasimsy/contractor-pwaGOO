import { describe, expect, it } from "vitest";
import { isBilledInvoice } from "@/lib/services/financialEngine";

describe("isBilledInvoice — what counts as money owed to the company", () => {
  it("an unsent draft is not owed yet", () => {
    expect(isBilledInvoice({ lifecycleStatus: "draft", status: "draft" })).toBe(false);
  });
  it("a sent, viewed or overdue invoice is owed", () => {
    expect(isBilledInvoice({ lifecycleStatus: "sent", status: "sent" })).toBe(true);
    expect(isBilledInvoice({ lifecycleStatus: "viewed", status: "viewed" })).toBe(true);
    expect(isBilledInvoice({ lifecycleStatus: "sent", status: "overdue" })).toBe(true);
  });
  it("a draft the customer already paid on counts (its status is no longer draft)", () => {
    expect(isBilledInvoice({ lifecycleStatus: "draft", status: "partially_paid" })).toBe(true);
  });
  it("void and cancelled never count", () => {
    expect(isBilledInvoice({ lifecycleStatus: "void", status: "void" })).toBe(false);
    expect(isBilledInvoice({ lifecycleStatus: "cancelled", status: "cancelled" })).toBe(false);
  });
});
