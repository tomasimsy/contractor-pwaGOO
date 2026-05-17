"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Client } from "@/types";
import Header from "@/components/ui/Header";

export default function ClientsPage() {
const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

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

return (
  <div className="min-h-screen bg-[#f6f7f9] pb-24">
    <Header title="Clients" backLink="/" />

    <div className="mx-auto max-w-4xl p-4">

      {/* TOP */}
      <div className="mb-4 flex items-center justify-between">

        <div>
          <div className="text-lg font-semibold text-gray-900">
            Clients
          </div>

          <div className="text-sm text-gray-500">
            Manage customer information
          </div>
        </div>

        {!loading && clients.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-400">
              Total
            </div>

            <div className="text-sm font-semibold text-gray-800">
              {clients.length}
            </div>
          </div>
        )}
      </div>

      {/* LOADING */}
      {loading && (
        <div className="rounded-2xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-500 shadow-sm">
          Loading clients...
        </div>
      )}

      {/* EMPTY */}
      {!loading && clients.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-14 text-center shadow-sm">
          <div className="text-sm font-medium text-gray-700">
            No clients yet
          </div>

          <div className="mt-1 text-xs text-gray-400">
            Your saved customers will appear here
          </div>
        </div>
      )}

      {/* CLIENT LIST */}
      <div className="space-y-3">
        {clients.map((client) => (
          <div
            key={client.id}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">

              {/* LEFT */}
              <div className="min-w-0 flex-1">

                <div className="truncate text-sm font-semibold capitalize text-gray-800">
                  {client.name}
                </div>

                {client.address && (
                  <div className="mt-2 text-xs leading-5 text-gray-500">
                    {client.address}
                  </div>
                )}
              </div>

              {/* RIGHT */}
              <div className="shrink-0 text-right space-y-1">

                {client.phone && (
                  <a
                    href={`tel:${client.phone}`}
                    className="block text-xs font-medium text-gray-700 transition hover:text-black"
                  >
                    {client.phone}
                  </a>
                )}

                {client.email && (
                  <div className="max-w-[160px] break-all text-[11px] text-gray-400">
                    {client.email}
                  </div>
                )}
              </div>

            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
  }