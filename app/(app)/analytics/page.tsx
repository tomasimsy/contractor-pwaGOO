import { LineChart } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function AnalyticsPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Analytics"
        description="KPIs and business performance at a glance."
        icon={LineChart}
              permission={{ resource: "financial_reports" }}
      />
    </PageContainer>
  );
}
