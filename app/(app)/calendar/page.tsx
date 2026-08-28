import { CalendarDays } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
import { RequirePermission } from "@/components/layout/RequirePermission";

export default function CalendarPage() {
  return (
    <RequirePermission resource="workspace" action="view">
      <PageContainer>
        <PlaceholderPage
          title="Calendar"
          description="Schedule jobs, crews, and appointments."
          icon={CalendarDays}
        />
      </PageContainer>
    </RequirePermission>
  );
}
