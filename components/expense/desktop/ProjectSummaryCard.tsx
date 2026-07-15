import type { FormCategory } from "@/components/expense/AddExpenseSheet";
import ProjectHeader from "@/components/expense/ProjectHeader";
import type { ProjectBundle } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";
import QuickActions from "./QuickActions";

export default function ProjectSummaryCard({
  bundle,
  onOpenAddSheet,
}: {
  bundle: ProjectBundle;
  onOpenAddSheet: (category?: FormCategory) => void;
}) {
  return (
    <DashboardPanel title="Project Summary" accent="gray">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <ProjectHeader bundle={bundle} />
        </div>
        <QuickActions onOpen={onOpenAddSheet} />
      </div>
    </DashboardPanel>
  );
}
