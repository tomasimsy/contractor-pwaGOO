"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import toast from "react-hot-toast";
import { Building2, Link2 } from "lucide-react";

type Mode = "create" | "join";

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteFromLink = searchParams.get("invite") ?? "";

  const [mode, setMode] = useState<Mode>(inviteFromLink ? "join" : "create");
  const [companyName, setCompanyName] = useState("");
  const [token, setToken] = useState(inviteFromLink);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (inviteFromLink) {
      setMode("join");
      setToken(inviteFromLink);
    }
  }, [inviteFromLink]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc("create_company_and_owner", {
        p_company_name: companyName.trim(),
      });
      if (error) throw error;
      toast.success("Company created!");
      router.replace("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Couldn't create the company. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    try {
      const { data: companyId, error } = await supabase.rpc("redeem_company_invite", {
        p_token: token.trim(),
      });
      if (error) throw error;

      let companyLabel = "the company";
      if (companyId) {
        const { data: company } = await supabase
          .from("companies")
          .select("name")
          .eq("id", companyId)
          .single();
        if (company?.name) companyLabel = company.name;
      }

      toast.success(`You've joined ${companyLabel}!`, {
        duration: 4000,
        position: "top-center",
        icon: "🎉",
        style: {
          background: "#fef3c7",
          color: "#92400e",
          border: "1px solid #fbbf24",
          padding: "8px 12px",
          fontSize: "12px",
        },
      });
      router.replace("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Couldn't join with that invite link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm max-w-md w-full p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-900">One more step</h1>
          <p className="text-slate-500 text-sm mt-1">
            Create a new company, or join one you were invited to.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-slate-200 p-1 mb-6 bg-slate-50">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md transition ${
              mode === "create"
                ? "bg-white shadow-sm text-slate-900"
                : "text-slate-500"
            }`}
          >
            <Building2 size={13} />
            Create a company
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md transition ${
              mode === "join"
                ? "bg-white shadow-sm text-slate-900"
                : "text-slate-500"
            }`}
          >
            <Link2 size={13} />
            Have an invite link?
          </button>
        </div>

        {mode === "create" ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-emerald-500/30 transition"
                placeholder="e.g., OSR Pros"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold text-sm py-2.5 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {loading && (
                <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              )}
              {loading ? "Creating..." : "Create Company"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Invite Link Token
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-emerald-500/30 transition font-mono"
                placeholder="Paste your invite token"
                required
              />
              {inviteFromLink && (
                <p className="text-[11px] text-emerald-700 mt-1.5">
                  Detected from your invite link — just confirm below.
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold text-sm py-2.5 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {loading && (
                <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              )}
              {loading ? "Joining..." : "Join Company"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <OnboardingContent />
      </Suspense>
    </ProtectedRoute>
  );
}
