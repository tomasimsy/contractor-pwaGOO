"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { Client } from "@/types";
import Header from "@/components/ui/Header";
import DeleteModal from "@/components/ui/DeleteModal";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import ClientDetailPanel from "@/components/clients/ClientDetailPanel";
import { getClientDetail, type ClientDetail } from "@/lib/queries/clients";
import { Pencil, Trash2, ChevronDown } from "lucide-react";

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: "", name: "" });
  const [deleting, setDeleting] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [detailByClient, setDetailByClient] = useState<Record<string, ClientDetail>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  // Always refetches on expand (no cache kept across opens) so a
  // payment/invoice/estimate change made elsewhere while this panel was
  // closed is never shown stale the next time it's opened.
  async function toggleClient(client: Client) {
    if (expandedClientId === client.id) {
      setExpandedClientId(null);
      return;
    }
    setExpandedClientId(client.id);
    setLoadingDetailId(client.id);
    try {
      const companyId = await getCompanyId();
      const detail = await getClientDetail(client.id, companyId);
      setDetailByClient((prev) => ({ ...prev, [client.id]: detail }));
    } finally {
      setLoadingDetailId(null);
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    const companyId = await getCompanyId();
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data) setClients(data as Client[]);
    setLoading(false);
  }

  async function handleDelete() {
    setDeleting(true);
    const companyId = await getCompanyId();
    // This DELETE is intercepted by a DB trigger and converted into a
    // soft delete (deleted_at/deleted_by) — the row is recoverable,
    // not gone. The company_id filter here is defense-in-depth so a
    // request can't target another company's client by id.
    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", deleteModal.id)
      .eq("company_id", companyId);

    if (error) {
      alert("Error deleting client");
    } else {
      await loadClients();
      setDeleteModal({ isOpen: false, id: "", name: "" });
    }
    setDeleting(false);
  }

  return (
    <ProtectedRoute>
      <DesktopShell title="Clients">
      <div className="min-h-screen md:min-h-0 bg-gray-50 md:bg-transparent pb-24 md:pb-0">
        <Header title="Clients" backLink="/" mdHidden />

        <div className="max-w-4xl md:max-w-none mx-auto md:mx-0 p-4 md:p-0 space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-3">
          {loading && <div className="text-center py-8 md:col-span-full">Loading...</div>}
          {!loading && clients.length === 0 && (
            <div className="text-center text-gray-400 py-8 md:col-span-full">
              No clients yet. Create one from the estimate page.
            </div>
          )}
          {clients.map((client) => {
            const isExpanded = expandedClientId === client.id;
            return (
          <div
            key={client.id}
            className={`bg-white rounded-xl p-3.5 shadow-sm hover:shadow-md transition ${isExpanded ? "md:col-span-full" : ""}`}
          >
            <div className="flex justify-between items-start gap-3">
              <button
                type="button"
                onClick={() => toggleClient(client)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-[15px] text-navy leading-tight">
                    {client.name}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-gray-400 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </div>

                {client.phone && (
                  <div className="text-[11px] text-gray-500 mt-0.5">📞 {client.phone}</div>
                )}
                {client.email && (
                  <div className="text-[11px] text-gray-500 leading-tight">✉️ {client.email}</div>
                )}
                {client.address && (
                  <div className="text-[11px] text-gray-500 leading-tight">📍 {client.address}</div>
                )}
              </button>

              <div className="flex gap-1.5">
                <Link
                  href={`/clients/${client.id}/edit`}
                  className="p-1.5 text-gray-400 hover:text-gold transition"
                >
                  <Pencil size={15} />
                </Link>

                <button
                  onClick={() =>
                    setDeleteModal({
                      isOpen: true,
                      id: client.id,
                      name: client.name,
                    })
                  }
                  className="p-1.5 text-gray-400 hover:text-red-500 transition"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {isExpanded && (
              <ClientDetailPanel detail={detailByClient[client.id] ?? null} loading={loadingDetailId === client.id} />
            )}
          </div>
            );
          })}
        </div>

        <DeleteModal
  isOpen={deleteModal.isOpen}
  onClose={() => setDeleteModal({ isOpen: false, id: "", name: "" })}
  onConfirm={handleDelete}
  title="Delete Client"
  message={`Are you sure you want to delete ${deleteModal.name}? It will be removed from this list but can be recovered if needed.`}
  deleting={deleting}
/>
      </div>
      </DesktopShell>
    </ProtectedRoute>
  );
}