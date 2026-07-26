"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { useServices } from "@/components/providers/ServicesProvider";
import type { Project } from "@/lib/services/projectService";

export default function EditProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { projectService } = useServices();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    projectService.getById(projectId).then((p) => {
      setProject(p);
      setLoading(false);
    });
  }, [projectService, projectId]);

  return (
    <RequirePermission resource="project" action="update">
      <PageContainer>
        <PageHeader title="Edit Project" />
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !project ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Project not found.</div>
        ) : (
          <ProjectForm project={project} />
        )}
      </PageContainer>
    </RequirePermission>
  );
}
