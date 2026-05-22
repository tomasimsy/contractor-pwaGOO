"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { Client } from "@/types";
import Header from "@/components/ui/Header";
import DeleteModal from "@/components/ui/DeleteModal";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Pencil, Trash2 } from "lucide-react";

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: "", name: "" });
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setClients(data as Client[]);
    setLoading(false);
  }

  async function handleDelete() {
    setDeleting(true);
    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", deleteModal.id);
    
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
      <div className="min-h-screen bg-gray-50 pb-24">
        <Header title="Clients" backLink="/" />

        <div className="max-w-4xl mx-auto p-4 space-y-3">
          {loading && <div className="text-center py-8">Loading...</div>}
          {!loading && clients.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              No clients yet. Create one from the estimate page.
            </div>
          )}
          {clients.map((client) => (
            <div key={client.id} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-semibold text-lg text-navy">{client.name}</div>
                  {client.phone && (
                    <div className="text-sm text-gray-500 mt-1">📞 {client.phone}</div>
                  )}
                  {client.email && (
                    <div className="text-sm text-gray-500">✉️ {client.email}</div>
                  )}
                  {client.address && (
                    <div className="text-sm text-gray-500">📍 {client.address}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/clients/${client.id}/edit`}
                    className="p-2 text-gray-400 hover:text-gold transition"
                  >
                    <Pencil size={18} />
                  </Link>
                  <button
                    onClick={() => setDeleteModal({ 
                      isOpen: true, 
                      id: client.id, 
                      name: client.name 
                    })}
                    className="p-2 text-gray-400 hover:text-red-500 transition"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <DeleteModal
  isOpen={deleteModal.isOpen}
  onClose={() => setDeleteModal({ isOpen: false, id: "", name: "" })}
  onConfirm={handleDelete}
  title="Delete Client"
  message={`Are you sure you want to delete ${deleteModal.name}? This action cannot be undone.`}
  deleting={deleting}
/>
      </div>
    </ProtectedRoute>
  );
}