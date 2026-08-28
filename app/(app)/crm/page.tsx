import { Contact } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
import { RequirePermission } from "@/components/layout/RequirePermission";

export default function CRMPage() {
  return (
    <RequirePermission resource="workspace" action="view">
      <PageContainer>
        <PlaceholderPage
          title="CRM"
          description="Manage your customer relationships in one place."
          icon={Contact}
        />
      </PageContainer>
    </RequirePermission>
  );
}
