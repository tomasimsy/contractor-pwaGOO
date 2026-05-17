"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [recentEstimates, setRecentEstimates] = useState<any[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalEstimates: 0,
    pendingEstimates: 0,
    signedEstimates: 0,
    totalInvoices: 0,
    paidInvoices: 0,
    pendingInvoices: 0
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    // Load recent estimates
    const { data: estimates } = await supabase
      .from("estimates")
      .select(`
        id,
        created_at,
        total,
        description,
        status,
        signature,
        clients (name)
      `)
      .order("created_at", { ascending: false })
      .limit(5);

    if (estimates) {
      setRecentEstimates(estimates);
      
      // Calculate stats
      const allEstimates = await supabase.from("estimates").select("status, signature");
      if (allEstimates.data) {
        const total = allEstimates.data.length;
        const pending = allEstimates.data.filter(e => e.status === "pending" && !e.signature).length;
        const signed = allEstimates.data.filter(e => e.signature).length;
        setStats(prev => ({ ...prev, totalEstimates: total, pendingEstimates: pending, signedEstimates: signed }));
      }
    }

    // Load recent invoices
    const { data: invoices } = await supabase
      .from("invoices")
      .select(`
        id,
        created_at,
        total,
        invoice_number,
        status,
        signature,
        clients (name)
      `)
      .order("created_at", { ascending: false })
      .limit(5);

    if (invoices) {
      setRecentInvoices(invoices);
      
      // Calculate invoice stats
      const allInvoices = await supabase.from("invoices").select("status");
      if (allInvoices.data) {
        const total = allInvoices.data.length;
        const paid = allInvoices.data.filter(i => i.status === "paid").length;
        const pending = allInvoices.data.filter(i => i.status !== "paid").length;
        setStats(prev => ({ ...prev, totalInvoices: total, paidInvoices: paid, pendingInvoices: pending }));
      }
    }
  }

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <h1 className="text-xl font-bold text-center">Dashboard</h1>
      </div>

      {/* Quick Actions */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <Link href="/estimates/create">
            <div className="bg-blue-500 text-white rounded-xl p-4 text-center hover:bg-blue-600 transition">
              <div className="text-2xl mb-1">📄</div>
              <div className="font-semibold">New Estimate</div>
            </div>
          </Link>
          <Link href="/invoices">
            <div className="bg-green-500 text-white rounded-xl p-4 text-center hover:bg-green-600 transition">
              <div className="text-2xl mb-1">💰</div>
              <div className="font-semibold">View Invoices</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-4 mb-4">
        <div className="grid grid-cols-2 gap-3">
          {/* Estimates Stats */}
          <div className="bg-white rounded-xl p-3 shadow-sm">
            <div className="text-gray-500 text-sm mb-2">📋 Estimates</div>
            <div className="text-2xl font-bold">{stats.totalEstimates}</div>
            <div className="flex justify-between text-xs mt-2">
              <span className="text-yellow-600">Pending: {stats.pendingEstimates}</span>
              <span className="text-green-600">Signed: {stats.signedEstimates}</span>
            </div>
            <Link href="/estimates" className="block text-center mt-2 text-blue-500 text-sm">
              View All →
            </Link>
          </div>

          {/* Invoices Stats */}
          <div className="bg-white rounded-xl p-3 shadow-sm">
            <div className="text-gray-500 text-sm mb-2">📊 Invoices</div>
            <div className="text-2xl font-bold">{stats.totalInvoices}</div>
            <div className="flex justify-between text-xs mt-2">
              <span className="text-yellow-600">Pending: {stats.pendingInvoices}</span>
              <span className="text-green-600">Paid: {stats.paidInvoices}</span>
            </div>
            <Link href="/invoices" className="block text-center mt-2 text-blue-500 text-sm">
              View All →
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Estimates */}
      <div className="px-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold">Recent Estimates</h2>
          <Link href="/estimates" className="text-blue-500 text-sm">See All</Link>
        </div>
        <div className="py-4 space-y-5 md:space-y-7">
          {recentEstimates.length === 0 ? (
            <div className="bg-white rounded-xl p-4 text-center text-gray-400">
              No estimates yet
            </div>
          ) : (
            recentEstimates.map((est) => (
              <Link key={est.id} href={`/estimates/${est.id}`}>
                <div className="bg-white rounded-xl p-3 shadow-sm hover:shadow transition mb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{est.clients?.name || "No client"}</div>
                      <div className="text-xs text-gray-400">
                        {new Date(est.created_at).toLocaleDateString()}
                      </div>
                      {est.description && (
                        <div className="text-sm text-gray-500 truncate max-w-[200px]">{est.description}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold">${est.total?.toFixed(2) || "0.00"}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        est.signature ? "bg-green-100 text-green-700" : 
                        est.status === "converted" ? "bg-purple-100 text-purple-700" : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {est.signature ? "Signed" : est.status === "converted" ? "Converted" : "Pending"}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="px-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold">Recent Invoices</h2>
          <Link href="/invoices" className="text-blue-500 text-sm">See All</Link>
        </div>
        <div className="py-4 space-y-4 md:space-y-6">
          {recentInvoices.length === 0 ? (
            <div className="bg-white rounded-xl p-4 text-center text-gray-400">
              No invoices yet
            </div>
          ) : (
            recentInvoices.map((inv) => (
              <Link key={inv.id} href={`/invoices/${inv.id}`}>
                <div className="bg-white rounded-xl p-3 shadow-sm hover:shadow transition mb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{inv.clients?.name || "No client"}</div>
                      <div className="text-xs text-gray-400">
                        {inv.invoice_number || inv.id.slice(0, 8)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">${inv.total?.toFixed(2) || "0.00"}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        inv.status === "paid" ? "bg-green-100 text-green-700" :
                        inv.signature ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {inv.status === "paid" ? "Paid" : inv.signature ? "Signed" : "Pending"}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Footer Nav */}
      <div className="fixed bottom-0 max-w-lg mx-auto w-full bg-white border-t px-4 py-2 flex justify-around">
        <Link href="/" className="flex flex-col items-center text-blue-500">
          <span className="text-xl">🏠</span>
          <span className="text-xs">Home</span>
        </Link>
        <Link href="/estimates" className="flex flex-col items-center text-gray-500">
          <span className="text-xl">📄</span>
          <span className="text-xs">Estimates</span>
        </Link>
        <Link href="/invoices" className="flex flex-col items-center text-gray-500">
          <span className="text-xl">💰</span>
          <span className="text-xs">Invoices</span>
        </Link>
        <Link href="/clients" className="flex flex-col items-center text-gray-500">
          <span className="text-xl">👥</span>
          <span className="text-xs">Clients</span>
        </Link>
      </div>
    </div>
  );
}