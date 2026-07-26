import { BarChart3 } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function ReportsPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Reports"
        description="Generate financial and operational reports."
        icon={BarChart3}
              permission={{ resource: "financial_reports" }}
      />
    </PageContainer>
  );
}
