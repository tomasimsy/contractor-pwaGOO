"use client";

/**
 * Compact tabbed wrapper around SubcontractorAssignmentPanel /
 * AgentAssignmentPanel — reuses both wholesale (no duplicated
 * assign/payment logic), just switches which one is visible so the
 * right sidebar doesn't need to stack two full panels back to back.
 * Lives in the sidebar precisely so assigning/paying a sub or agent
 * doesn't require scrolling past Roof Areas/Line Items/Financial
 * Summary first.
 *
 * Both panels are always mounted (toggled with a CSS `hidden` class,
 * not conditional rendering) so a parent's `refreshAgents()` call
 * always reaches a live AgentAssignmentPanel instance, even while the
 * Subcontractors tab is the one currently visible — needed so
 * recording an expense elsewhere on the page (Estimate Detail's
 * ProjectExpensesPanel) can immediately refresh the agent reimbursement
 * balance without the user having to switch tabs first.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { HardHat, Briefcase } from "lucide-react";
import { SubcontractorAssignmentPanel } from "@/components/subcontractors/SubcontractorAssignmentPanel";
import { AgentAssignmentPanel, type AgentAssignmentPanelRef } from "@/components/agents/AgentAssignmentPanel";

export interface SubAgentTabsPanelRef {
  /** Refreshes the Agent panel's roster/assignments/balances/pending
   * reimbursements — called after an expense is recorded/edited/
   * deleted/marked reimbursed elsewhere on the page. */
  refreshAgents: () => Promise<void>;
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
  const [tab, setTab] = useState<"subcontractors" | "agents">("subcontractors");
  const agentPanelRef = useRef<AgentAssignmentPanelRef>(null);

  useImperativeHandle(ref, () => ({
    refreshAgents: async () => {
      await agentPanelRef.current?.refresh();
    },
  }), []);

  return (
    <div className="rounded-lg border border-border/60 bg-card">
      <div className="flex border-b border-border/60">
        <button
          type="button"
          onClick={() => setTab("subcontractors")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold ${
            tab === "subcontractors" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <HardHat className="size-3.5" /> Subcontractors
        </button>
        <button
          type="button"
          onClick={() => setTab("agents")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold ${
            tab === "agents" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Briefcase className="size-3.5" /> Agents
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
      </div>
    </div>
  );
});
