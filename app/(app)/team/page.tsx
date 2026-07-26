import { UsersRound } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export default function TeamPage() {
  return (
    <PageContainer>
      <PlaceholderPage
        title="Team"
        description="Manage team members and roles."
        icon={UsersRound}
              permission={{ resource: "user_roles" }}
      />
    </PageContainer>
  );
}
