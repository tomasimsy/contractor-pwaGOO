"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function TeamHomeScreen() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top Header */}
      <div className="p-4 border-b border-slate-800">
        <h1 className="text-xl font-bold">One Square Team</h1>
        <p className="text-sm text-slate-400">Dashboard Overview</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 p-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">Estimates</p>
            <h2 className="text-2xl font-bold">12</h2>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">Invoices</p>
            <h2 className="text-2xl font-bold">8</h2>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">Customers</p>
            <h2 className="text-2xl font-bold">24</h2>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">Revenue</p>
            <h2 className="text-2xl font-bold">$14.2k</h2>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="px-4 space-y-3">
        <Link href="/create-estimate">
  <Button className="w-full">
    + Create Estimate
  </Button>
</Link>
        <Button variant="secondary" className="w-full">
          View Invoices
        </Button>
      </div>

      {/* Recent Activity */}
      <div className="p-4 mt-4">
        <h2 className="text-sm text-slate-400 mb-2">Recent Activity</h2>

        <div className="space-y-2 text-sm">
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
            Estimate #105 created
          </div>
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
            Invoice #89 sent
          </div>
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
            New customer added
          </div>
        </div>
      </div>

      {/* Bottom Nav (mobile app feel) */}
      <div className="mt-auto border-t border-slate-800 flex justify-around p-3 bg-slate-950">
        <button className="text-sm">Home</button>
        <button className="text-sm text-slate-400">Estimates</button>
        <button className="text-sm text-slate-400">Invoices</button>
        <button className="text-sm text-slate-400">Settings</button>
      </div>
    </div>
  );
}