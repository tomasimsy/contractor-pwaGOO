import { FolderOpen } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
import { RequirePermission } from "@/components/layout/RequirePermission";

export default function DocumentsPage() {
  return (
    <RequirePermission resource="workspace" action="view">
      <PageContainer>
        <PlaceholderPage
          title="Documents"
          description="Store and organize project documents."
          icon={FolderOpen}
        />
      </PageContainer>
    </RequirePermission>
  );
}
