import { ReceiptText } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function ExpensesPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Expenses"
        description="Log material, labor, and other project costs."
        icon={ReceiptText}
              permission={{ resource: "expense" }}
      />
    </PageContainer>
  );
}
