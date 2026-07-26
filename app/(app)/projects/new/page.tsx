"use client";

import { useSearchParams } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { ProjectForm } from "@/components/projects/ProjectForm";

export default function NewProjectPage() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("clientId") ?? undefined;

  return (
    <RequirePermission resource="project" action="create">
      <PageContainer>
        <PageHeader title="New Project" description="Create a new job to attach estimates, invoices, and expenses to." />
        <ProjectForm defaultClientId={clientId} />
      </PageContainer>
    </RequirePermission>
  );
}
