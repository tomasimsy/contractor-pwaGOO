import ProjectHeader from "@/components/expense/ProjectHeader";
import type { ProjectBundle } from "@/lib/types";
import DashboardPanel from "./DashboardPanel";

export default function ProjectSummaryCard({
  bundle,
}: {
  bundle: ProjectBundle;
}) {
  return (
    <DashboardPanel title="Project Summary" accent="gray">
      <ProjectHeader bundle={bundle} />
    </DashboardPanel>
  );
}
