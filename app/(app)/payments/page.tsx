import { Wallet } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function PaymentsPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Payments"
        description="Record and review customer payments."
        icon={Wallet}
              permission={{ resource: "payment" }}
      />
    </PageContainer>
  );
}
