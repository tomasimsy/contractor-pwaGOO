"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Invoice } from "@/types";
import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
import Header from "@/components/ui/Header";
import { Trash2, Send, Link2 } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvoices();
  }, []);

  async function loadInvoices() {
    const { data } = await supabase
      .from("invoices")
      .select("*, clients(name, phone)")
      .order("created_at", { ascending: false });

    if (data) setInvoices(data as Invoice[]);
    setLoading(false);
  }

  const getStatus = (inv: Invoice) => {
    if (inv.status === "paid")
      return {
        label: "Paid",
        className: "bg-green-100 text-green-700",
      };

    if (inv.signature)
      return {
        label: "Signed",
        className: "bg-blue-100 text-blue-700",
      };

    return {
      label: "Pending",
      className: "bg-yellow-100 text-yellow-700",
    };
  };

  const isOverdue = (inv: Invoice) => {
    if (!inv.due_date) return false;
    if (inv.status === "paid") return false;
    if (inv.remaining_balance === 0) return false;
    return new Date(inv.due_date) < new Date();
  };

  // Send SMS Link
  const sendSMSLink = (inv: Invoice) => {
    const phoneNumber = inv.clients?.phone;
    
    if (!phoneNumber) {
      alert("No phone number on file. Please add a phone number to this client first.");
      return;
    }
    
    const baseUrl = window.location.origin;
    const documentUrl = `${baseUrl}/public/invoices/${inv.id}`;
    
    const totalPaid = (inv.total || 0) - (inv.remaining_balance || 0);
    const remainingBalance = inv.remaining_balance || inv.total || 0;
    
    let paymentStatus = "";
    if (totalPaid === 0) {
      paymentStatus = `Total Due: $${(inv.total || 0).toFixed(2)}`;
    } else if (remainingBalance === 0) {
      paymentStatus = `✓ FULLY PAID - Thank you!`;
    } else {
      paymentStatus = `Paid: $${totalPaid.toFixed(2)} | Balance: $${remainingBalance.toFixed(2)}`;
    }
    
    const message = encodeURIComponent(
      `Hello ${inv.clients?.name}! Please review your invoice: ${documentUrl}\n\n` +
      `Invoice #${inv.invoice_number}\n` +
      `${paymentStatus}\n\n` +
      `Click the link above to view and sign. Thank you!`
    );
    
    window.location.href = `sms:${phoneNumber}?body=${message}`;
  };

  // Copy Link function for invoice
  const copyLink = (invoice: Invoice) => {
    const baseUrl = window.location.origin;
    const documentUrl = `${baseUrl}/public/invoices/${invoice.id}`;
    navigator.clipboard.writeText(documentUrl);
    alert(`Link copied: ${documentUrl}`);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#f6f7f9] pb-24">
        {/* HEADER */}
        <Header title="Invoices" backLink="/" />

        {/* CONTENT */}
        <div className="mx-auto max-w-4xl p-4">
          {/* TOP */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-gray-900">Invoices</div>
              <div className="text-sm text-gray-500">Track invoices and payments</div>
            </div>

            {!loading && invoices.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-gray-400">Total</div>
                <div className="text-sm font-semibold text-gray-800">{invoices.length}</div>
              </div>
            )}
          </div>

          {/* LOADING */}
          {loading && (
            <div className="rounded-2xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-500 shadow-sm">
              Loading invoices...
            </div>
          )}

          {/* EMPTY */}
          {!loading && invoices.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-14 text-center shadow-sm">
              <div className="text-sm font-medium text-gray-700">No invoices yet</div>
              <div className="mt-1 text-xs text-gray-400">Converted invoices will appear here</div>
            </div>
          )}

          {/* LIST */}
          <div className="space-y-3">
            {invoices.map((inv) => {
              const status = getStatus(inv);
              const overdue = isOverdue(inv);
              const totalPaid = (inv.total || 0) - (inv.remaining_balance || 0);

              return (
                <div
                  key={inv.id}
                  onClick={() => router.push(`/invoices/${inv.id}`)}
                  className="group cursor-pointer rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* LEFT */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="truncate text-sm font-semibold text-gray-800">
                          {inv.clients?.name || "No client"}
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                          {status.label}
                        </span>
                        {overdue && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
                            Overdue
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-xs text-gray-400">{inv.invoice_number}</div>

                      <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
                        <div>
                          Due:{" "}
                          <span className="text-gray-700">
                            {inv.due_date ? formatShortDate(inv.due_date) : "—"}
                          </span>
                        </div>
                        {inv.remaining_balance > 0 && inv.remaining_balance !== inv.total && (
                          <div>
                            Balance:{" "}
                            <span className="font-medium text-gray-800">
                              {formatCurrency(inv.remaining_balance)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* RIGHT */}
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCurrency(inv.total)}
                      </div>

                      {inv.status === "paid" ? (
                        <div className="mt-2 text-[11px] text-green-600">Fully Paid</div>
                      ) : inv.remaining_balance > 0 ? (
                        <div className="mt-2 text-[11px] text-gray-500">
                          Remaining{" "}
                          <span className="font-medium text-gray-700">
                            {formatCurrency(inv.remaining_balance)}
                          </span>
                        </div>
                      ) : null}

                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            sendSMSLink(inv);
                          }}
                          className="flex items-center gap-1 rounded-lg text-navy bg-white px-2 py-1 text-xs shadow-sm border border-gray-200 hover:bg-gray-50"
                        >
                          <Send size={12} /> SMS
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyLink(inv);
                          }}
                          className="p-1 text-gray-400 hover:text-gold transition"
                          title="Copy Invoice Link"
                        >
                          <Link2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}