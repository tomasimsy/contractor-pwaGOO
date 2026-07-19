"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { filterActive } from '@/lib/queries/softDeleteFilter';
import { Client } from "@/types";
import { getCompanyId } from "@/lib/supabase/getCompanyId";

interface ClientSelectorProps {
  selectedId: string;
  onSelect: (id: string) => void;
  companyId?: string | null; // 👈 add this
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

  const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

      useEffect(() => {
      loadClients();
      }, []);

      // Close dropdown when clicking outside
      useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setShowSearch(false);
      }
      };

      if (showSearch) {
      document.addEventListener("mousedown", handleClickOutside);
      }

      return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      };
      }, [showSearch]);

      async function loadClients() {
      const { data } = await supabase.from("clients").select("*").is("deleted_at", null).limit(20);
      if (data) setClients(data);
      }

      async function createClient() {
      if (!newName.trim()) return;

       const companyId = await getCompanyId();
       
      const { data } = await supabase
      .from("clients")
      .insert({
      name: newName,
      phone: newPhone || null,
      email: newEmail || null,
      company_id: companyId, // 👈 add this line
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
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 transition-all duration-200">
        <div className="text-[11px] text-gray-500 mb-2">Client</div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {selectedClient.name}
            </div>
            {selectedClient.phone && (
            <div className="text-[11px] text-gray-500">{selectedClient.phone}</div>
            )}
          </div>
          <button onClick={()=> onSelect("")}
            className="text-[11px] px-2 py-1 rounded-md bg-green-700 text-white hover:bg-green-800 transition"
            >
            Change
          </button>
        </div>
      </div>
      );
      }

      /* ===================== DEFAULT SELECT ===================== */
      return (
      <div className="text-sm relative transition-all duration-200">
        <div className="  text-gray-500 mb-2">Client</div>

        {/* SEARCH INPUT */}
        <input ref={searchInputRef} type="text" placeholder="Search client..." value={searchTerm} onChange={(e)=>
        setSearchTerm(e.target.value)}
        onFocus={() => setShowSearch(true)}
        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2
        focus:ring-green-500/30 focus:border-green-500 transition-all"
        />

        {/* DROPDOWN */}
        {showSearch && (
        <div ref={dropdownRef}
          className="absolute left-3 right-3 top-[72px] bg-white border border-gray-100 rounded-xl shadow-lg max-h-60 overflow-y-auto z-20">
          {/* CREATE NEW */}
          <button onClick={()=> {
            setShowSearch(false);
            setShowNewForm(true);
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-900 border-b hover:bg-green-50 transition"
            >
            <span className="text-green-600 font-medium">＋</span> Create new client
          </button>

          {/* LIST */}
          {clients
          .filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
          .map((c) => (
          <button key={c.id} onClick={()=> {
            onSelect(c.id);
            setShowSearch(false);
            setSearchTerm("");
            }}
            className="w-full text-left px-3 py-2 hover:bg-green-50 border-b last:border-b-0 transition"
            >
            <div className="text-sm font-medium text-gray-900">{c.name}</div>
            {c.phone && <div className="text-[11px] text-gray-500">{c.phone}</div>}
          </button>
          ))}
        </div>
        )}

        {/* NEW CLIENT MODAL */}
        {showNewForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-5 shadow-xl">
            <div className="text-base font-semibold mb-4 text-gray-800">New Client</div>

            <input type="text" placeholder="Name *" value={newName} onChange={(e)=> setNewName(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none
            focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
            />

            <input type="tel" placeholder="Phone" value={newPhone} onChange={(e)=> setNewPhone(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none
            focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
            />

            <input type="email" placeholder="Email" value={newEmail} onChange={(e)=> setNewEmail(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none
            focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
            />

            <div className="flex gap-3">
              <button onClick={()=> setShowNewForm(false)}
                className="flex-1 text-sm py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50
                transition"
                >
                Cancel
              </button>
              <button onClick={createClient}
                className="flex-1 text-sm py-2 rounded-lg bg-green-700 text-white hover:bg-green-800 transition">
                Create
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
      );
      }