import { UserPlus } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function LeadsPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Leads"
        description="Track and convert incoming leads."
        icon={UserPlus}

      />
    </PageContainer>
  );
}
