"use client";

/**
 * Compact tabbed wrapper around SubcontractorAssignmentPanel /
 * AgentAssignmentPanel / TeamMembersPanel — reuses all three wholesale
 * (no duplicated assign/payment logic), just switches which one is
 * visible so the right sidebar doesn't need to stack three full panels
 * back to back. Lives in the sidebar precisely so assigning/paying a
 * sub, agent, or team member doesn't require scrolling past Roof
 * Areas/Line Items/Financial Summary first.
 *
 * All three panels are always mounted (toggled with a CSS `hidden`
 * class, not conditional rendering) so a parent's `refreshAgents()`
 * call always reaches a live AgentAssignmentPanel instance, even while
 * a different tab is the one currently visible — needed so recording
 * an expense elsewhere on the page (Estimate Detail's
 * ProjectExpensesPanel) can immediately refresh the agent
 * reimbursement balance without the user having to switch tabs first.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { HardHat, Briefcase, UsersRound, Clock } from "lucide-react";
import { EstimateEmployeesPanel } from "@/components/estimates/EstimateEmployeesPanel";
import { SubcontractorAssignmentPanel } from "@/components/subcontractors/SubcontractorAssignmentPanel";
import { AgentAssignmentPanel, type AgentAssignmentPanelRef } from "@/components/agents/AgentAssignmentPanel";
import { TeamMembersPanel, type TeamMembersPanelRef } from "@/components/estimates/TeamMembersPanel";

export interface SubAgentTabsPanelRef {
  /** Refreshes the Agent panel's roster/assignments/balances/pending
   * reimbursements — called after an expense is recorded/edited/
   * deleted/marked reimbursed elsewhere on the page. */
  refreshAgents: () => Promise<void>;
  /** Same, for the Team tab — called after an expense affecting a team
   * member's personally-paid/reimbursed figures changes elsewhere. */
  refreshTeam: () => Promise<void>;
}

export const SubAgentTabsPanel = forwardRef<SubAgentTabsPanelRef, {
  companyId: string;
  projectId: string;
  /** The estimate being viewed, when there is one. Payments recorded
   * from here are tagged with it so the cost lands on the job rather
   * than only on the project. Absent on project-level usage, where no
   * single estimate is implied. */
  estimateId?: string | null;
  onChanged?: () => void;
}>(function SubAgentTabsPanel({ companyId, projectId, estimateId, onChanged }, ref) {
  const [tab, setTab] = useState<"subcontractors" | "agents" | "team" | "employees">("subcontractors");
  const agentPanelRef = useRef<AgentAssignmentPanelRef>(null);
  const teamPanelRef = useRef<TeamMembersPanelRef>(null);

  useImperativeHandle(ref, () => ({
    refreshAgents: async () => {
      await agentPanelRef.current?.refresh();
    },
    refreshTeam: async () => {
      await teamPanelRef.current?.refresh();
    },
  }), []);

  return (
    <div className="rounded-2xl border border-[#E2E5E0] bg-white p-4">
      <div className="mb-3 flex gap-1 border-b border-[#E2E5E0] pb-2">
        <button
          type="button"
          onClick={() => setTab("subcontractors")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium ${
            tab === "subcontractors" ? "bg-[#1B2430] text-white" : "bg-[#F8F9F7] text-[#5B6675] hover:text-[#1B2430]"
          }`}
        >
          <HardHat className="size-3.5" /> Subs
        </button>
        <button
          type="button"
          onClick={() => setTab("agents")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium ${
            tab === "agents" ? "bg-[#1B2430] text-white" : "bg-[#F8F9F7] text-[#5B6675] hover:text-[#1B2430]"
          }`}
        >
          <Briefcase className="size-3.5" /> Agents
        </button>
        <button
          type="button"
          onClick={() => setTab("team")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium ${
            tab === "team" ? "bg-[#1B2430] text-white" : "bg-[#F8F9F7] text-[#5B6675] hover:text-[#1B2430]"
          }`}
        >
          <UsersRound className="size-3.5" /> Team
        </button>
        <button
          type="button"
          onClick={() => setTab("employees")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium ${
            tab === "employees" ? "bg-[#1B2430] text-white" : "bg-[#F8F9F7] text-[#5B6675] hover:text-[#1B2430]"
          }`}
        >
          <Clock className="size-3.5" /> Employees
        </button>
      </div>

      <div className="p-3">
        <div className={tab === "subcontractors" ? "" : "hidden"}>
          <SubcontractorAssignmentPanel companyId={companyId} projectId={projectId}
          estimateId={estimateId} onChanged={onChanged} compact />
        </div>
        <div className={tab === "agents" ? "" : "hidden"}>
          <AgentAssignmentPanel ref={agentPanelRef} companyId={companyId} projectId={projectId}
          estimateId={estimateId} onChanged={onChanged} compact />
        </div>
        <div className={tab === "team" ? "" : "hidden"}>
          {estimateId ? (
            <TeamMembersPanel ref={teamPanelRef} companyId={companyId} estimateId={estimateId}
            projectId={projectId} onChanged={onChanged} compact />
          ) : (
            <p className="text-xs text-muted-foreground">Team assignments require an estimate.</p>
          )}
        </div>
        <div className={tab === "employees" ? "" : "hidden"}>
          {estimateId ? (
            <EstimateEmployeesPanel companyId={companyId} estimateId={estimateId} onChanged={onChanged} />
          ) : (
            <p className="text-xs text-muted-foreground">Employee assignments require an estimate.</p>
          )}
        </div>
      </div>
    </div>
  );
});
