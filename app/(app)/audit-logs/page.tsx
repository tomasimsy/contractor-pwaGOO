import { History } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function AuditLogsPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Audit Logs"
        description="Review every change made across the company."
        icon={History}
              permission={{ resource: "audit_log" }}
      />
    </PageContainer>
  );
}
