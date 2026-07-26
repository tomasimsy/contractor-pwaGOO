import { CalendarDays } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function CalendarPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Calendar"
        description="Schedule jobs, crews, and appointments."
        icon={CalendarDays}

      />
    </PageContainer>
  );
}
