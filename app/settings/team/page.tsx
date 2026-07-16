"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCompanyId } from "@/lib/supabase/getCompanyId";
import Header from "@/components/ui/Header";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DesktopShell from "@/components/layout/DesktopShell";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { UserPlus, Copy } from "lucide-react";

type Member = { id: string; email: string; role: "owner" | "member" };
type Invite = { id: string; token: string; status: string; created_at: string };

function TeamContent() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const isOwner = members.find((m) => m.id === selfId)?.role === "owner";

  const loadMembers = useCallback(async () => {
    const { data, error } = await supabase.rpc("list_company_members");
    if (error) {
      toast.error("Couldn't load team members.");
      return;
    }
    setMembers(data || []);
  }, []);

  const loadInvites = useCallback(async () => {
    const companyId = await getCompanyId();
    const { data, error } = await supabase
      .from("company_invites")
      .select("id, token, status, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (!error) setInvites(data || []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setSelfId(user?.id ?? null);
      await Promise.all([loadMembers(), loadInvites()]);
      setLoading(false);
    })();
  }, [loadMembers, loadInvites]);

  const createInvite = async () => {
    setCreatingInvite(true);
    try {
      const companyId = await getCompanyId();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("company_invites")
        .insert({ company_id: companyId, invited_by: user?.id })
        .select("token")
        .single();
      if (error) throw error;

      const link = `${window.location.origin}/onboarding?invite=${data.token}`;
      setInviteLink(link);
      await loadInvites();
    } catch (err: any) {
      toast.error(err.message || "Couldn't create invite.");
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied!", {
      duration: 3000,
      position: "top-center",
      icon: "🔗",
      style: {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fbbf24",
        padding: "6px 12px",
        fontSize: "12px",
      },
    });
  };

  const revokeInvite = async (id: string) => {
    const { error } = await supabase
      .from("company_invites")
      .update({ status: "revoked" })
      .eq("id", id);
    if (error) {
      toast.error("Couldn't revoke invite.");
      return;
    }
    toast.success("Invite revoked.");
    await loadInvites();
  };

  const closeInviteModal = () => {
    setInviteModalOpen(false);
    setInviteLink(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/70 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <div className="text-[11px] font-medium text-slate-400">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <DesktopShell title="Team">
    <div className="min-h-screen md:min-h-0 bg-slate-50/70 md:bg-transparent">
      <Header title="Team" backLink="/settings" mdHidden />

      <div className="mx-auto max-w-2xl md:max-w-none md:mx-0 space-y-5 p-4 md:p-0">
        {/* Members */}
        <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Members
            </span>
            {isOwner && (
              <button
                onClick={() => setInviteModalOpen(true)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100 transition"
              >
                <UserPlus size={13} />
                Invite teammate
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-800 truncate">
                  {m.email}
                  {m.id === selfId && <span className="text-slate-400 font-normal"> (you)</span>}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    m.role === "owner"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pending invites — Owner only */}
        {isOwner && invites.length > 0 && (
          <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-3">
              Pending Invites
            </span>
            <div className="divide-y divide-slate-100">
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-2.5 gap-2">
                  <span className="text-xs text-slate-500 font-mono truncate">
                    {inv.token.slice(0, 8)}…
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() =>
                        copyLink(`${window.location.origin}/onboarding?invite=${inv.token}`)
                      }
                      className="text-slate-400 hover:text-slate-600 p-1"
                      aria-label="Copy invite link"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => revokeInvite(inv.id)}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={inviteModalOpen} onClose={closeInviteModal} title="Invite a teammate">
        {!inviteLink ? (
          <>
            <p className="text-sm text-slate-500 mb-5">
              This creates a link that adds whoever opens it to your company as a
              Member — send it however you like.
            </p>
            <button
              onClick={createInvite}
              disabled={creatingInvite}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold text-sm py-2.5 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {creatingInvite && (
                <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              )}
              {creatingInvite ? "Creating..." : "Create invite link"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-3">Share this link with your teammate:</p>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-4">
              <span className="text-xs text-slate-700 font-mono truncate flex-1">{inviteLink}</span>
              <button
                onClick={() => copyLink(inviteLink)}
                className="shrink-0 text-emerald-700 hover:text-emerald-800"
                aria-label="Copy link"
              >
                <Copy size={15} />
              </button>
            </div>
            <button
              onClick={closeInviteModal}
              className="w-full py-2 border border-slate-200 rounded-lg text-slate-600 text-sm hover:bg-slate-50 transition"
            >
              Done
            </button>
          </>
        )}
      </Modal>
    </div>
    </DesktopShell>
  );
}

export default function TeamPage() {
  return (
    <ProtectedRoute>
      <TeamContent />
    </ProtectedRoute>
  );
}
