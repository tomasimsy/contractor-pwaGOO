import { UserPlus } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
import { RequirePermission } from "@/components/layout/RequirePermission";

export default function LeadsPage() {
  return (
    <RequirePermission resource="workspace" action="view">
      <PageContainer>
        <PlaceholderPage
          title="Leads"
          description="Track and convert incoming leads."
          icon={UserPlus}
        />
      </PageContainer>
    </RequirePermission>
  );
}
