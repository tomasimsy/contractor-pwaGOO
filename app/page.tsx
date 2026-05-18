"use client";

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

  const phoneNumber = "7043034112";

  const sendSMS = (type: "estimate" | "general") => {
    const messages = {
      estimate:
        "Hi OSR Pros, I would like to request an estimate for a remodeling project.",
      general:
        "Hi OSR Pros, I would like more information about your services.",
    };

    const body = encodeURIComponent(messages[type]);
    window.location.href = `sms:${phoneNumber}?body=${body}`;
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">

      {/* HERO */}
      <div className="bg-slate-900 text-white">

        {/* TOP BAR */}
        <div className="border-b border-white/10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">

            <Image
              src="/OSR_logo.png"
              alt="OSR Pros"
              width={140}
              height={40}
              className="h-8 w-auto"
            />

            <button
              onClick={() => sendSMS("general")}
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-medium text-white hover:bg-amber-600"
            >
              Contact
            </button>
          </div>
        </div>

        {/* HERO CONTENT */}
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:items-center">

          {/* LEFT */}
          <div className="space-y-5">

            <div className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-300">
              North Carolina • Charlotte • Greensboro • Winston-Salem • Surrounding Areas
            </div>

            <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
              Remodeling & Construction
              <span className="block text-slate-300">
                done right the first time.
              </span>
            </h1>

            <p className="text-sm leading-6 text-slate-300 md:text-base">
              OSR Pros provides residential and commercial remodeling,
              roofing, and build-outs across North Carolina with clean
              execution and reliable communication.
            </p>

            {/* CTA */}
            <div className="flex flex-col gap-3 sm:flex-row">

              <button
                onClick={() => sendSMS("estimate")}
                className="rounded-lg bg-amber-500 px-5 py-3 text-sm font-medium text-white hover:bg-amber-600"
              >
                Request Estimate
              </button>

              <button
                onClick={() => sendSMS("general")}
                className="rounded-lg border border-white/20 px-5 py-3 text-sm text-white hover:bg-white/10"
              >
                Talk to Us
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Tap any button to message us directly via SMS
            </p>
          </div>

          {/* RIGHT IMAGE */}
          <div className="w-full">
            <div className="overflow-hidden rounded-2xl">
              <Image
                src="/hero-remodel.jpg"
                alt="Construction Work"
                width={900}
                height={700}
                className="h-auto w-full object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </div>

      {/* SERVICES */}
      <div className="mx-auto max-w-6xl px-4 py-14">

        <h2 className="text-xl font-semibold">What we do</h2>
        <p className="mt-1 text-sm text-slate-500">
          Simple, reliable construction services across North Carolina
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

          {[
            {
              title: "Home Remodeling",
              desc: "Kitchens, bathrooms, flooring, and full home renovations.",
            },
            {
              title: "Retail Build-Outs",
              desc: "Commercial spaces for offices, shops, and restaurants.",
            },
            {
              title: "Roofing & Exterior",
              desc: "Roof repair, siding, gutters, and exterior protection.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="mb-3 h-8 w-8 rounded-lg bg-amber-100" />
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* WHY */}
      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14">

          <h2 className="text-xl font-semibold">Why choose OSR Pros</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-3">

            {[
              {
                title: "Clear communication",
                desc: "We keep you updated from start to finish.",
              },
              {
                title: "Quality work",
                desc: "Clean, professional craftsmanship every time.",
              },
              {
                title: "Easy process",
                desc: "Just send a message and we handle the rest.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-200 p-5"
              >
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA FINAL */}
      <div className="bg-slate-900">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">

          <h2 className="text-xl font-semibold text-white md:text-2xl">
            Ready to get started?
          </h2>

          <p className="mt-3 text-sm text-slate-300">
            Send us a quick message and we’ll respond with details and pricing.
          </p>

          <button
            onClick={() => sendSMS("estimate")}
            className="mt-6 rounded-lg bg-amber-500 px-5 py-3 text-sm font-medium text-white hover:bg-amber-600"
          >
            Request Estimate via SMS
          </button>

          <p className="mt-3 text-xs text-slate-400">
            704-303-4112
          </p>
        </div>
      </div>

      {/* FOOTER */}
      <div className="border-t border-slate-200 bg-slate-50 py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-slate-500">
          © 2026 OSR Pros • North Carolina Remodeling & Construction
        </div>
      </div>
    </div>
  );
}