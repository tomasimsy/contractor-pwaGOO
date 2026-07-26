import { Landmark } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function TaxCenterPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Tax Center"
        description="Sales tax, 1099s, and filing exports."
        icon={Landmark}
              permission={{ resource: "tax_settings" }}
      />
    </PageContainer>
  );
}
