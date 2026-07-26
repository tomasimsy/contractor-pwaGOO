import { Settings } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function SettingsPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Settings"
        description="Configure company, billing, and preferences."
        icon={Settings}
              permission={{ resource: "company_settings" }}
      />
    </PageContainer>
  );
}
