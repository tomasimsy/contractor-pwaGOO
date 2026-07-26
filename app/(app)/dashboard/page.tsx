import { LayoutDashboard } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Landing page after sign-in — proves the shell (sidebar, header,
 * breadcrumbs, permissions) works end-to-end, NOT a business page.
 * Real dashboard content (per the "Dashboard Redesign" work already
 * done in contractor-pwa: money in today, who needs paying, losing
 * jobs, overdue invoices, today's priority) is future work here, once
 * ServicesProvider has a real backing implementation.
 */
export default function DashboardPage() {
  return (
    <PageContainer>
      <PageHeader title="Dashboard" description="Welcome back — here's your application shell." />
      <EmptyState
        icon={LayoutDashboard}
        title="Dashboard content coming soon"
        description="The navigation, layout, authentication, and permissions you see around this page are the real foundation — actionable dashboard content lands in a future update."
      />
    </PageContainer>
  );
}
