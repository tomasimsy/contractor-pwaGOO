import { FolderOpen } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function DocumentsPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Documents"
        description="Store and organize project documents."
        icon={FolderOpen}

      />
    </PageContainer>
  );
}
