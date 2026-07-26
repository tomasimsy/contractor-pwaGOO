import { Calculator } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function AccountingPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Accounting"
        description="Chart of accounts, general ledger, and financial statements."
        icon={Calculator}
              permission={{ resource: "financial_reports" }}
      />
    </PageContainer>
  );
}
