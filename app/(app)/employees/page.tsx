"use client";

import { EmployeeNumber } from "@/components/employees/EmployeeNumber";
import { useCallback, useEffect, useState } from "react";
import { UsersRound, Plus } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { EmployeeForm } from "@/components/employees/EmployeeForm";
import type { Employee } from "@/lib/services/employeeService";

function EmployeesContent() {
  const { employeeService } = useServices();
  const { profile } = useAuth();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // undefined = closed; "new" = adding; an Employee = editing that one.
  const [modal, setModal] = useState<"new" | Employee | undefined>(undefined);
  // Changing this remounts the form with empty fields ("Save and add another").
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    if (!profile?.companyId) return;
    setLoading(true);
    setError(null);
    try {
      setEmployees(await employeeService.list({ companyId: profile.companyId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }, [employeeService, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <PageContainer>
      <PageHeader
        title="Employees"
        description="Your W-2 staff: pay rate, login, and the jobs they work on."
        actions={
          <button
            type="button"
            onClick={() => setModal("new")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Add Employee
          </button>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-[13px] text-muted-foreground">Loading…</div>
      ) : employees.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <EmptyState
            icon={UsersRound}
            title="No employees yet"
            description="Add your crew and office staff here. Then they can be clocked in and assigned to estimates."
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-primary/10 text-[11px] uppercase tracking-wide text-primary [&_th]:px-4 [&_th]:py-2 [&_th]:font-semibold">
              <tr>
                <th>Name</th>
                <th className="hidden md:table-cell">Title · Location</th>
                <th className="hidden sm:table-cell">Contact</th>
                <th className="text-right">Pay</th>
                <th className="hidden lg:table-cell">Login</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map((employee) => (
                <tr key={employee.id} className="align-top hover:bg-muted/30">
                  <td className="min-w-[8rem] px-4 py-2.5">
                    <button type="button" onClick={() => setModal(employee)} className="text-left font-semibold text-foreground hover:text-primary hover:underline">
                      {employee.name}
                    </button>
                    <EmployeeNumber value={employee.employeeNumber} className="ml-2" />
                  </td>
                  <td className="hidden px-4 py-2.5 text-[12px] md:table-cell">
                    <div className="text-foreground">{employee.jobTitle || "—"}</div>
                    <div className="text-muted-foreground">
                      {employee.addressCity && employee.addressState ? `${employee.addressCity}, ${employee.addressState}` : "No address yet"}
                    </div>
                  </td>
                  <td className="hidden px-4 py-2.5 text-[12px] text-muted-foreground sm:table-cell">{employee.phone || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <div className="font-semibold text-foreground">
                      ${employee.hourlyRate.toFixed(2)}
                      <span className="font-normal text-muted-foreground">{employee.payType === "daily" ? "/day" : "/hr"}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{employee.payFrequency === "weekly" ? "Weekly" : "Every 2 weeks"}</div>
                  </td>
                  <td className="hidden px-4 py-2.5 text-[12px] text-muted-foreground lg:table-cell">
                    {employee.profileId ? "App login" : "No app login"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={employee.isActive ? "success" : "neutral"}>{employee.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        size="xl"
        open={modal !== undefined}
        onClose={() => setModal(undefined)}
        title={modal && modal !== "new" ? "Edit employee" : "Add employee"}
      >
        {modal !== undefined && (
          <EmployeeForm
            key={formKey}
            employee={modal === "new" ? undefined : modal}
            onCancel={() => setModal(undefined)}
            onSaved={(_saved, addAnother) => {
              // "Save and add another" reopens a blank form straight away.
              if (addAnother) {
                setFormKey((k) => k + 1);
                setModal("new");
              } else {
                setModal(undefined);
              }
              load();
            }}
          />
        )}
      </Modal>
    </PageContainer>
  );
}

export default function EmployeesPage() {
  return (
    <RequirePermission resource="employee" action="view">
      <EmployeesContent />
    </RequirePermission>
  );
}
