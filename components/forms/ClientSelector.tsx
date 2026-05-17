"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Client } from "@/types";

interface ClientSelectorProps {
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function ClientSelector({
  selectedId,
  onSelect,
}: ClientSelectorProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    const { data } = await supabase.from("clients").select("*").limit(20);
    if (data) setClients(data);
  }

  async function createClient() {
    if (!newName.trim()) return;

    const { data } = await supabase
      .from("clients")
      .insert({
        name: newName,
        phone: newPhone || null,
        email: newEmail || null,
      })
      .select()
      .single();

    if (data) {
      setClients([data, ...clients]);
      onSelect(data.id);
      setShowNewForm(false);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
    }
  }

  const selectedClient = clients.find((c) => c.id === selectedId);

  /* ===================== SELECTED STATE ===================== */
  if (selectedId && selectedClient) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
        <div className="text-[11px] text-gray-500 mb-2">
          Client
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {selectedClient.name}
            </div>

            {selectedClient.phone && (
              <div className="text-[11px] text-gray-500">
                {selectedClient.phone}
              </div>
            )}
          </div>

          <button
            onClick={() => onSelect("")}
            className="text-[11px] px-2 py-1 rounded-md bg-gray-900 text-white hover:bg-gray-800 transition"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  /* ===================== DEFAULT SELECT ===================== */
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 relative">

      <div className="text-[11px] text-gray-500 mb-2">
        Client
      </div>

      {/* SEARCH INPUT */}
      <input
        type="text"
        placeholder="Search client..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onFocus={() => setShowSearch(true)}
        className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
      />

      {/* DROPDOWN */}
      {showSearch && (
        <div className="absolute left-3 right-3 top-[72px] bg-white border border-gray-100 rounded-xl shadow-lg max-h-60 overflow-y-auto z-20">

          {/* CREATE NEW */}
          <button
            onClick={() => {
              setShowSearch(false);
              setShowNewForm(true);
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-900 border-b hover:bg-gray-50"
          >
            <span className="text-gray-500">＋</span> Create new client
          </button>

          {/* LIST */}
          {clients
            .filter((c) =>
              c.name.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onSelect(c.id);
                  setShowSearch(false);
                  setSearchTerm("");
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
              >
                <div className="text-sm font-medium text-gray-900">
                  {c.name}
                </div>

                {c.phone && (
                  <div className="text-[11px] text-gray-500">
                    {c.phone}
                  </div>
                )}
              </button>
            ))}
        </div>
      )}

      {/* NEW CLIENT MODAL */}
      {showNewForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-4 shadow-xl">

            <div className="text-sm font-semibold mb-3">
              New Client
            </div>

            <input
              type="text"
              placeholder="Name *"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-md px-2 py-2 text-sm mb-2"
            />

            <input
              type="tel"
              placeholder="Phone"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-md px-2 py-2 text-sm mb-2"
            />

            <input
              type="email"
              placeholder="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-md px-2 py-2 text-sm mb-3"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setShowNewForm(false)}
                className="flex-1 text-sm py-2 rounded-md border border-gray-200 bg-white"
              >
                Cancel
              </button>

              <button
                onClick={createClient}
                className="flex-1 text-sm py-2 rounded-md bg-gray-900 text-white hover:bg-gray-800"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}