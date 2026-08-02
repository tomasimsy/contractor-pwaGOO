import Link from "next/link";
import { Building2, FolderLock } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirePermission } from "@/components/layout/RequirePermission";

export default function SettingsPage() {
  return (
    <RequirePermission resource="company_settings" action="view">
      <PageContainer>
        <PageHeader title="Settings" description="Configure company information and business documents." />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/settings/company"
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-muted/40"
          >
            <Building2 className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <div className="font-medium text-foreground">Company Settings</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                Name, contact info, address, license/tax details, logo, and branding — the single source every invoice, estimate, PDF, and customer-facing page reads from.
              </div>
            </div>
          </Link>

          <Link
            href="/settings/company/documents"
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-muted/40"
          >
            <FolderLock className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <div className="font-medium text-foreground">Company Documents</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                LLC/EIN paperwork, licenses, insurance, tax documents, and other business files — securely stored, categorized, and searchable.
              </div>
            </div>
          </Link>
        </div>
      </PageContainer>
    </RequirePermission>
  );
}
