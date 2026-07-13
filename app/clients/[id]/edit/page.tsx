"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import Header from "@/components/ui/Header";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

export default function EditClientPage() {
  const router = useRouter();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [client, setClient] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });

  useEffect(() => {
    loadClient();
  }, [id]);

  async function loadClient() {
    const companyId = await getCompanyId();
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .single();

    if (data) {
      setClient({
        name: data.name || "",
        phone: data.phone || "",
        email: data.email || "",
        address: data.address || "",
      });
    }
    setLoading(false);
  }

  async function saveClient() {
    if (!client.name.trim()) {
      alert("Client name is required");
      return;
    }

    setSaving(true);
    const companyId = await getCompanyId();
    const { error } = await supabase
      .from("clients")
      .update({
        name: client.name,
        phone: client.phone || null,
        email: client.email || null,
        address: client.address || null,
      })
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      alert("Error saving: " + error.message);
    } else {
      alert("Client updated successfully!");
      router.push(`/clients`);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <Header title="Edit Client" backLink="/clients" />
          <div className="p-8 text-center">Loading...</div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 pb-24">
        <Header title="Edit Client" backLink="/clients" />

        <div className="max-w-4xl mx-auto p-4 space-y-4">
          {/* Name */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={client.name}
              onChange={(e) => setClient({ ...client, name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-gold"
              placeholder="John Smith"
            />
          </div>

          {/* Phone */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={client.phone}
              onChange={(e) => setClient({ ...client, phone: e.target.value })}
              className="w-full border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-gold"
              placeholder="(704) 555-1234"
            />
            <p className="text-xs text-gray-400 mt-1">
              Used for sending SMS links
            </p>
          </div>

          {/* Email */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={client.email}
              onChange={(e) => setClient({ ...client, email: e.target.value })}
              className="w-full border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-gold capitalize"
              placeholder="john@example.com"
            />
          </div>

          {/* Address */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <textarea
              value={client.address}
              onChange={(e) => setClient({ ...client, address: e.target.value })}
              className="w-full border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-gold capitalize"
              rows={3}
              placeholder="123 Main St, Charlotte, NC 28202"
            />
          </div>

          {/* Save Button */}
          <button
            onClick={saveClient}
            disabled={saving}
            className="w-full py-3 rounded-xl font-semibold text-white transition-all duration-200
                      bg-[#0e542c] hover:bg-[#0c4726]
                      hover:shadow-md hover:-translate-y-[1px]
                      active:scale-[0.98]
                      disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </ProtectedRoute>
  );
}