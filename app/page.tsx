"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setIsLoggedIn(!!user);
  }

  return (
    <div className="min-h-screen bg-[#f6f7f9]">

      {/* HERO */}
      <div className="relative overflow-hidden border-b border-gray-200 bg-white">

        {/* TOP BAR */}
        <div className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">

            {/* LOGO */}
            <div className="flex items-center gap-3">

              <Image
                src="/OSR_logo.png"
                alt="One Square Roof"
                width={150}
                height={42}
                className="h-10 w-auto object-contain"
                priority
              />
            </div>

            {/* ACTIONS */}
            <div className="flex items-center gap-2">

              {isLoggedIn ? (
                <Link
                  href="/dashboard"
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Sign In
                  </Link>

                  <Link
                    href="/signup"
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {/* HERO CONTENT */}
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-20 text-center">

          {/* BADGE */}
          <div className="mb-5 rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
            Roofing CRM & Estimate Platform
          </div>

          {/* TITLE */}
          <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-gray-900 md:text-6xl">
            Modern Estimates & Invoices
            <span className="block text-gray-400">
              Built for Contractors
            </span>
          </h1>

          {/* SUBTITLE */}
          <p className="mt-6 max-w-2xl text-base leading-7 text-gray-500 md:text-lg">
            Create professional estimates, manage projects,
            collect signatures, and track payments —
            all in one clean workflow.
          </p>

          {/* CTA */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">

            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="rounded-2xl bg-gray-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="rounded-2xl bg-gray-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-gray-800"
                >
                  Create Account
                </Link>

                <Link
                  href="/login"
                  className="rounded-2xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <div className="mx-auto max-w-6xl px-4 py-14">

        <div className="mb-8">

          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Features
          </div>

          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Everything you need to run your business
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">

          {/* CARD 1 */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">

            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-2xl">
              📄
            </div>

            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Smart Estimates
            </h3>

            <p className="text-sm leading-6 text-gray-500">
              Create detailed estimates with multiple
              projects, line items, pricing, and summaries.
            </p>
          </div>

          {/* CARD 2 */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">

            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-2xl">
              ✍️
            </div>

            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Digital Signatures
            </h3>

            <p className="text-sm leading-6 text-gray-500">
              Let customers review and sign documents
              from any device in seconds.
            </p>
          </div>

          {/* CARD 3 */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">

            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-2xl">
              💰
            </div>

            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Payment Tracking
            </h3>

            <p className="text-sm leading-6 text-gray-500">
              Track deposits, balances, and completed
              payments with clean reporting.
            </p>
          </div>
        </div>
      </div>

      {/* CTA SECTION */}
      <div className="border-t border-gray-200 bg-white">

        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-16 text-center">

          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Built for modern roofing companies
          </h2>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-500">
            Replace spreadsheets, PDFs, and paper contracts
            with a clean contractor workflow your team
            and customers will actually enjoy using.
          </p>

          {!isLoggedIn && (
            <Link
              href="/signup"
              className="mt-8 rounded-2xl bg-gray-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              Start Free
            </Link>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div className="border-t border-gray-200 bg-[#f6f7f9] py-8">

        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-gray-400 md:flex-row">

          <p>© 2026 One Square Roof. All rights reserved.</p>

          <div className="flex items-center gap-4">
            <span>OSR Pros LLC</span>
          </div>
        </div>
      </div>
    </div>
  );
}