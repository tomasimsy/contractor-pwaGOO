import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Contact,
  FolderKanban,
  FileText,
  GitPullRequest,
  Receipt,
  Wallet,
  ReceiptText,
  Calculator,
  Banknote,
  BarChart3,
  LineChart,
  Landmark,
  FolderOpen,
  CalendarDays,
  UsersRound,
  History,
  Settings,
  Home,
  HardHat,
  Briefcase,
} from "lucide-react";
import type { Resource, PermissionAction } from "@/lib/services";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** If set, the item is hidden unless the current role can perform
   * `action` on `resource` (lib/services/permissions.ts's PERMISSION_MATRIX
   * — the same check ValidationService uses, via usePermission()).
   * Omitted entirely for items with no corresponding Resource in the
   * existing permission model (CRM/Leads/Clients/Documents/Calendar) —
   * rather than invent new Resource values for a shell-only pass, those
   * stay visible to every authenticated role. Accounting/Payroll/
   * Reports/Analytics all gate on "financial_reports" since that's the
   * closest existing resource to "sensitive company-wide financial
   * data" — an imperfect mapping worth revisiting once those modules
   * get their own real resource types, not a permanent decision. */
  permission?: { resource: Resource; action: PermissionAction };
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Sales",
    items: [
      { id: "crm", label: "CRM", href: "/crm", icon: Contact },
      { id: "leads", label: "Leads", href: "/leads", icon: UserPlus },
      { id: "clients", label: "Clients", href: "/clients", icon: Users },
    ],
  },
  {
    label: "Projects",
    items: [
      { id: "projects", label: "Projects", href: "/projects", icon: FolderKanban, permission: { resource: "project", action: "view" } },
      { id: "estimates", label: "Estimates", href: "/estimates", icon: FileText, permission: { resource: "estimate", action: "view" } },
      { id: "estimate-roof", label: "Estimate Roof", href: "/estimates-roof", icon: Home, permission: { resource: "estimate", action: "view" } },
      { id: "change-orders", label: "Change Orders", href: "/change-orders", icon: GitPullRequest, permission: { resource: "estimate", action: "view" } },
      { id: "subcontractors", label: "Subcontractors", href: "/subcontractors", icon: HardHat, permission: { resource: "subcontractor_assignment", action: "view" } },
      { id: "agents", label: "Agents", href: "/agents", icon: Briefcase, permission: { resource: "agent_assignment", action: "view" } },
    ],
  },
  {
    label: "Billing",
    items: [
      { id: "invoices", label: "Invoices", href: "/invoices", icon: Receipt, permission: { resource: "invoice", action: "view" } },
      { id: "payments", label: "Payments", href: "/payments", icon: Wallet, permission: { resource: "payment", action: "view" } },
      { id: "expenses", label: "Expenses", href: "/expenses", icon: ReceiptText, permission: { resource: "expense", action: "view" } },
    ],
  },
  {
    label: "Finance",
    items: [
      { id: "accounting", label: "Accounting", href: "/accounting", icon: Calculator, permission: { resource: "financial_reports", action: "view" } },
      { id: "payroll", label: "Payroll", href: "/payroll", icon: Banknote, permission: { resource: "financial_reports", action: "view" } },
      { id: "reports", label: "Reports", href: "/reports", icon: BarChart3, permission: { resource: "financial_reports", action: "view" } },
      { id: "analytics", label: "Analytics", href: "/analytics", icon: LineChart, permission: { resource: "financial_reports", action: "view" } },
      { id: "tax-center", label: "Tax Center", href: "/tax-center", icon: Landmark, permission: { resource: "tax_settings", action: "view" } },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "documents", label: "Documents", href: "/documents", icon: FolderOpen },
      { id: "calendar", label: "Calendar", href: "/calendar", icon: CalendarDays },
      { id: "team", label: "Team", href: "/team", icon: UsersRound, permission: { resource: "user_roles", action: "view" } },
      { id: "audit-logs", label: "Audit Logs", href: "/audit-logs", icon: History, permission: { resource: "audit_log", action: "view" } },
    ],
  },
  {
    label: "General",
    items: [{ id: "settings", label: "Settings", href: "/settings", icon: Settings, permission: { resource: "company_settings", action: "view" } }],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
