import { Receipt } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function InvoicesPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Invoices"
        description="Bill clients and track what's owed."
        icon={Receipt}
              permission={{ resource: "invoice" }}
      />
    </PageContainer>
  );
}
