"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import toast from "react-hot-toast";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If email confirmation is required, Supabase returns no session —
    // the user isn't signed in yet, so /onboarding (which requires
    // login) would just bounce them to /login. Show an inline message
    // instead of redirecting. If confirmation is off, a session comes
    // back immediately and they can go straight to onboarding.
    if (data.session) {
      toast.success("Account created!");
      router.push("/onboarding");
    } else {
      setCheckEmail(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm max-w-md w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-slate-900">Create your account</h1>
          <p className="text-slate-500 text-sm mt-1">Sign up to manage your business</p>
        </div>

        {checkEmail ? (
          <div className="text-center bg-emerald-50 border border-emerald-100 rounded-xl p-5">
            <p className="text-sm font-semibold text-emerald-800">Check your email</p>
            <p className="text-sm text-emerald-700 mt-1">
              We sent a confirmation link to <span className="font-medium">{email}</span>.
              Confirm your address, then sign in to finish setting up your company.
            </p>
            <button
              onClick={() => router.push("/login")}
              className="mt-4 text-sm font-semibold text-emerald-700 hover:underline"
            >
              Go to sign in
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-emerald-500/30 transition"
                  placeholder="admin@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-emerald-500/30 transition"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>

              {error && (
                <div className="bg-rose-50 text-rose-600 border border-rose-200 p-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold text-sm py-2.5 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {loading && (
                  <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                )}
                {loading ? "Creating account..." : "Sign Up"}
              </button>
            </form>

            <p className="text-center text-sm text-slate-500 mt-6">
              Already have an account?{" "}
              <button
                onClick={() => router.push("/login")}
                className="text-emerald-700 font-semibold hover:underline"
              >
                Sign in
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
