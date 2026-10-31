import { describe, expect, it } from "vitest";
import { createInMemoryServices } from "@/lib/services/testing/inMemoryServices";
import { contractPaymentExpense, loadContractRows } from "@/lib/services/subcontractorPayroll";

const COMPANY = "company-reimb";

/** An agent's reimbursement (an expense they paid for) is owed and paid on
 * Payroll, in the same check as their commission. */
describe("agent reimbursements on Payroll", () => {
  async function setup() {
    const s = createInMemoryServices();
    const project = await s.projectService.create({ companyId: COMPANY, name: "Job", clientId: null } as never);
    const agent = await s.agentCommissionService.createAgent({ companyId: COMPANY, name: "Agent-1" });
    await s.agentCommissionService.assignToProject({ companyId: COMPANY, projectId: project.id, agentId: agent.id, assignedAmount: 100 });
    // The agent paid $45 for materials on the job.
    const fronted = await s.expenseService.create({
      companyId: COMPANY, projectId: project.id, expenseType: "materials", amount: 45, expenseDate: "2026-10-20",
      description: "Shingles", paidByType: "agent", paidById: agent.id, isPaid: true,
    });
    return { s, agent, fronted };
  }

  it("shows the reimbursement as owed on the agent's row, on top of commission", async () => {
    const { s, agent } = await setup();
    const [row] = (await loadContractRows(s, COMPANY, () => "Job")).filter((r) => r.payeeId === agent.id);
    expect(row.reimbursements.map((r) => r.amount)).toEqual([45]);
    expect(row.owed).toBe(145);
  });

  it("paid together with the commission, it shows as one check and nothing is owed", async () => {
    const { s, agent, fronted } = await setup();
    let [row] = (await loadContractRows(s, COMPANY, () => "Job")).filter((r) => r.payeeId === agent.id);
    const checkId = "check-1";
    for (const line of row.lines) {
      await s.expenseService.create(contractPaymentExpense(row, line, { companyId: COMPANY, amount: line.outstanding, paidOn: "2026-11-01", paymentMethod: "Check 1042", checkId }));
    }
    await s.expenseService.markReimbursed(fronted.id, { paidOn: "2026-11-01", method: "Check 1042", reference: "1042", checkId });

    [row] = (await loadContractRows(s, COMPANY, () => "Job")).filter((r) => r.payeeId === agent.id);
    expect(row.owed).toBe(0);
    expect(row.reimbursements).toEqual([]);
    // Commission part and reimbursement part share the check.
    expect(new Set(row.payments.map((p) => p.checkKey))).toEqual(new Set([`check:${checkId}`]));
    expect(row.payments.map((p) => [p.kind, p.amount]).sort()).toEqual([["job", 100], ["reimbursement", 45]]);
  });

  it("reversing puts the reimbursement back to owed", async () => {
    const { s, agent, fronted } = await setup();
    await s.expenseService.markReimbursed(fronted.id, { paidOn: "2026-11-01", method: "Check", checkId: "c" });
    await s.expenseService.unmarkReimbursed(fronted.id);
    const [row] = (await loadContractRows(s, COMPANY, () => "Job")).filter((r) => r.payeeId === agent.id);
    expect(row.reimbursements.map((r) => r.amount)).toEqual([45]);
  });

  it("counts no extra cost: the expense is counted once, reimbursed or not", async () => {
    const { s, fronted } = await setup();
    const before = (await s.expenseService.listForCompany(COMPANY)).reduce((t, e) => t + e.amount, 0);
    await s.expenseService.markReimbursed(fronted.id, { paidOn: "2026-11-01", method: "Check", checkId: "c" });
    const after = (await s.expenseService.listForCompany(COMPANY)).reduce((t, e) => t + e.amount, 0);
    expect(after).toBe(before);
  });
});
