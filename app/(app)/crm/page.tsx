import { Contact } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function CRMPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="CRM"
        description="Manage your customer relationships in one place."
        icon={Contact}

      />
    </PageContainer>
  );
}
