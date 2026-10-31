"use client";

/**
 * One pay stub. An employee opens their own from My pay; the office opens
 * any employee's from Payroll history. Both read the same records Payroll
 * uses (payee_payments, approved hours), built by lib/payStub.ts.
 */
import { DEFAULT_COMPANY_SETTINGS } from "@/lib/company";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { RequirePermission } from "@/components/layout/RequirePermission";
import { useServices } from "@/components/providers/ServicesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { createSupabasePayeePaymentService } from "@/lib/services/supabase/payeePaymentService";
import { buildPayStub, type PayStubData } from "@/lib/payStub";
import { PayStub, type PayStubCompany, type PayStubEmployee } from "@/components/payroll/PayStub";

function PayStubContent() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const services = useServices();
  const { profile } = useAuth();
  const [data, setData] = useState<{ stub: PayStubData; company: PayStubCompany; employee: PayStubEmployee } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.companyId || !paymentId) return;
    const companyId = profile.companyId;
    let cancelled = false;
    (async () => {
      try {
        const payService = createSupabasePayeePaymentService(
          supabase,
          {
            employeeService: services.employeeService,
            timeEntryService: services.timeEntryService,
            estimateService: services.estimateService,
            projectService: services.projectService,
            expenseService: services.expenseService,
          },
          companyId
        );
        const rows = await payService.load();
        const row = rows.find((r) => r.kind === "employee" && r.payments.some((p) => p.id === paymentId));
        const payment = row?.payments.find((p) => p.id === paymentId);
        if (!row || !payment) throw new Error("This pay stub isn't available.");
        const employeeId = row.key.replace("employee:", "");
        const [emp, settings, entries] = await Promise.all([
          services.employeeService.getById(employeeId),
          services.companyService.getByCompanyId(companyId, null),
          services.timeEntryService.listForEmployee(employeeId, {
            from: payment.periodStart ?? payment.paidOn,
            to: payment.periodEnd ?? payment.paidOn,
          }),
        ]);
        if (!emp) throw new Error("Employee record not found.");
        // Payroll's own line labels ("Hourly · OSR… · Kitchen", "Hourly · company time"),
        // so a payment without parts is still described the way Payroll paid it.
        const labels = new Map(row.lines.filter((l) => l.kind !== "reimbursement").map((l) => [l.estimateId, l.label]));
        const stub = buildPayStub({
          payment,
          allPayments: row.payments,
          entries,
          payType: emp.payType === "daily" ? "daily" : "hourly",
          labelFor: (id) => labels.get(id) ?? (id ? "Hourly · Job" : "Hourly · company time"),
        });
        // Settings not filled in come back as placeholder text ("Add your
        // business address in Settings"); a pay document leaves those out.
        const real = (value: string | null | undefined, placeholder: string) => {
          const v = (value ?? "").trim();
          return v && v !== placeholder ? v : "";
        };
        // The saved address often already holds city, state and zip; add them only when it doesn't.
        const street = real(settings.company_address, DEFAULT_COMPANY_SETTINGS.company_address);
        const cityLine = [settings.city?.trim(), [settings.state?.trim(), settings.zip?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
        const hasCity = !!settings.zip && street.includes(settings.zip.trim());
        const companyAddress = [street, hasCity ? "" : cityLine].filter(Boolean).join("\n");
        if (cancelled) return;
        setData({
          stub,
          company: {
            name: real(settings.company_name, DEFAULT_COMPANY_SETTINGS.company_name) || "Company",
            address: companyAddress || null,
            phone: real(settings.company_phone, DEFAULT_COMPANY_SETTINGS.company_phone) || null,
            email: real(settings.company_email, DEFAULT_COMPANY_SETTINGS.company_email) || null,
            taxId: real(settings.tax_id, DEFAULT_COMPANY_SETTINGS.tax_id) || null,
          },
          employee: {
            id: emp.id,
            employeeNumber: emp.employeeNumber ?? null,
            name: emp.name,
            address: [emp.addressStreet, [emp.addressCity, [emp.addressState, emp.addressZip].filter(Boolean).join(" ")].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join(", ") || null,
            jobTitle: emp.jobTitle,
            ssnLast4: emp.ssnLast4,
            payType: emp.payType === "daily" ? "daily" : "hourly",
            rate: emp.hourlyRate,
            payFrequency: emp.payFrequency,
          },
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load this pay stub.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // services is a stable context object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.companyId, paymentId]);

  const isEmployee = profile?.role === "employee";

  // The stub is a paper document laid out at a fixed width. On a narrow
  // screen it is scaled down to fit, like a PDF, rather than squeezed.
  const PAPER = 848;
  const frameRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const paper = paperRef.current;
    if (!frame || !paper) return;
    const measure = () => {
      const scale = Math.min(1, frame.clientWidth / PAPER);
      setFit({ scale, height: paper.offsetHeight * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    ro.observe(paper);
    return () => ro.disconnect();
  }, [data]);
  return (
    <PageContainer>
      {/* Print only the stub, on white, edge to edge. */}
      <style>{`@media print { body * { visibility: hidden; } #pay-stub, #pay-stub * { visibility: visible; } #pay-stub { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; box-shadow: none; border: 0; } }`}</style>
      <div className="mx-auto mb-3 flex max-w-[800px] items-center justify-between gap-3 print:hidden">
        <Link href={isEmployee ? "/my-pay" : "/payroll/history"} className="text-[13px] text-primary hover:underline">
          ← {isEmployee ? "My pay" : "Payment history"}
        </Link>
        {data && (
          <button type="button" onClick={() => window.print()} className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
            Print / Save as PDF
          </button>
        )}
      </div>
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : error || !data ? (
        <div className="mx-auto max-w-md rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error ?? "Not found."}</div>
      ) : (
        <div ref={frameRef} className="mx-auto w-full max-w-[848px]" style={{ height: fit.height || undefined }}>
          <div
            id="pay-stub"
            ref={paperRef}
            className="origin-top-left rounded-lg border border-border bg-white p-6 shadow-sm print:!transform-none"
            style={{ width: PAPER, transform: fit.scale < 1 ? `scale(${fit.scale})` : undefined }}
          >
            <PayStub stub={data.stub} company={data.company} employee={data.employee} />
          </div>
        </div>
      )}
    </PageContainer>
  );
}

export default function PayStubPage() {
  return (
    <RequirePermission resource="time_entry" action="view">
      <PayStubContent />
    </RequirePermission>
  );
}
