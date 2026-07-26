import { Banknote } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function PayrollPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Payroll"
        description="Run payroll and manage pay stubs."
        icon={Banknote}
              permission={{ resource: "financial_reports" }}
      />
    </PageContainer>
  );
}
