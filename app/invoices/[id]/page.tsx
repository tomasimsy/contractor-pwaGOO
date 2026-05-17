"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Invoice, Client, Project, Signature } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils/formatting";
import Header from "@/components/ui/Header";
import Card from "@/components/ui/Card";
import SignaturePad from "@/components/signature/SignaturePad";
import PaymentModal from "@/components/payments/PaymentModal";
import Link from "next/link";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";

export default function InvoicePage() {
  const router = useRouter();
  const { id } = useParams();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  const { settings } = useCompanySettings();

  useEffect(() => {
    loadInvoice();
  }, [id]);

  async function loadInvoice() {
    try {
      const { data: inv } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .single();

      setInvoice(inv);

      if (inv?.client_id) {
        const { data: c } = await supabase
          .from("clients")
          .select("*")
          .eq("id", inv.client_id)
          .single();
        setClient(c);
      }

      const { data: items } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", id);

      const map: Record<string, Project> = {};

      items?.forEach((item) => {
        const name = item.project_name || "Main Project";
        if (!map[name]) {
          map[name] = { id: crypto.randomUUID(), name, line_items: [] };
        }
        map[name].line_items.push(item);
      });

      setProjects(Object.values(map));

      const { data: pays } = await supabase
        .from("invoice_payments")
        .select("*")
        .eq("invoice_id", id)
        .order("created_at", { ascending: false });

      setPayments(pays || []);
    } finally {
      setLoading(false);
    }
  }

  const remainingBalance =
    invoice?.remaining_balance ??
    (invoice?.total || 0) - (invoice?.amount_paid || 0);

  const isPaid = invoice?.status === "paid";

  const isOverdue =
    invoice?.due_date &&
    !isPaid &&
    remainingBalance > 0 &&
    new Date(invoice.due_date) < new Date();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading invoice...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7f9] pb-20">

      {/* HEADER */}
      <Header
        title={`Invoice #${invoice?.invoice_number || id?.slice(0, 8)}`}
        backLink="/invoices"
        rightAction={
          <div className="flex gap-2">
            <Link href={`/api/invoices/${id}/pdf`} target="_blank">
              <button className="h-9 w-9 rounded-xl border border-gray-200 bg-white shadow-sm hover:bg-gray-50">
                📄
              </button>
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-4xl space-y-4 p-4">

        {/* STATUS BAR */}
        <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <div className="text-[11px] uppercase text-gray-400">
              Invoice
            </div>
            <div className="text-sm font-semibold text-gray-800">
              #{invoice?.invoice_number || id?.slice(0, 8)}
            </div>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-[11px] font-medium ${
              isPaid
                ? "bg-green-100 text-green-700"
                : isOverdue
                ? "bg-red-100 text-red-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {isPaid ? "Paid" : isOverdue ? "Overdue" : "Pending"}
          </span>
        </div>

        {/* COMPANY + CLIENT */}
{/* COMPANY + CLIENT + DATES */}
<Card>
<div className="space-y-6 text-sm">

  {/* Top Row: Company + Client */}
  <div className="flex justify-between gap-6">

    {/* LEFT: Company */}
    <div className="w-1/2">
      <div className="text-[11px] uppercase text-gray-400 mb-2">
        From
      </div>
      <div className="font-semibold">{settings.company_name}</div>
      <div className="text-sm text-gray-500">{settings.company_address}</div>
      <div className="text-sm text-gray-500">{settings.company_phone}</div>
      <div className="text-sm text-gray-500">{settings.company_email}</div>
    </div>

    {/* RIGHT: Client + Dates */}
    <div className="w-1/2 flex flex-col items-end">

      {/* Client Info */}
      <div className="text-right">
        <div className="text-[11px] uppercase text-gray-400 mb-2">
          Bill To
        </div>

        <div className="font-semibold">{client?.name}</div>
        <div className="text-sm text-gray-500">{client?.phone}</div>
        <div className="text-sm text-gray-500">{client?.email}</div>
      </div>

      {/* Dates (properly aligned under client) */}
      <div className="mt-4 w-full max-w-xs space-y-2 text-sm">

        <div className="flex justify-end">
          <span className="text-gray-500">Issue Date: </span>
          <span>{formatDate(invoice?.issue_date)}</span>
        </div>

        <div className="flex justify-end">
          <span className="text-gray-500">Due Date: </span>
          <span className={isOverdue ? "text-red-600 font-medium" : ""}>
            {formatDate(invoice?.due_date)}
          </span>
        </div>

      </div>
    </div>
  </div>
</div>
</Card>

        {/* ITEMS */}
        {projects.map((project) => (
          <Card key={project.id} title={project.name}>
            <div className="space-y-3">
              {project.line_items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between border-b pb-2 last:border-0"
                >
                  <div>
                    <div className="font-medium text-sm">{item.name}</div>
                    <div className="text-xs text-gray-400">
                      {item.quantity} × {formatCurrency(item.unit_price)}
                    </div>
                  </div>
                  <div className="font-semibold text-sm">
                    {formatCurrency(item.total)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}

        {/* SUMMARY */}
        <Card title="Summary">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(invoice?.subtotal || 0)}</span>
            </div>

            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span>{formatCurrency(invoice?.total || 0)}</span>
            </div>

            {invoice?.amount_paid > 0 && (
              <>
                <div className="flex justify-between text-green-600">
                  <span>Paid</span>
                  <span>-{formatCurrency(invoice.amount_paid)}</span>
                </div>

                <div className="flex justify-between text-blue-600 font-semibold">
                  <span>Balance</span>
                  <span>{formatCurrency(remainingBalance)}</span>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* PAY BUTTON */}
        {remainingBalance > 0 && !isPaid && (
          <button
            onClick={() => setShowPaymentModal(true)}
            className="w-full rounded-2xl bg-green-600 py-3 text-white font-semibold shadow-sm hover:bg-green-700"
          >
            Record Payment ({formatCurrency(remainingBalance)})
          </button>
        )}

        {/* SIGNATURE */}
        <Card title="Signature">
          <SignaturePad
            onSave={() => {}}
            existingSignature={invoice?.signature}
            buttonText="Sign Invoice"
          />
        </Card>
      </div>

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSave={() => {}}
        remainingBalance={remainingBalance}
        saving={savingPayment}
      />
    </div>
  );
}