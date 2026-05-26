"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function HeroSection() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section className="relative h-screen w-full overflow-hidden bg-black text-white">

      {/* BACKGROUND */}
      <div
        className="absolute inset-0 bg-cover  "
        style={{
          backgroundImage:
            "url('/LandingPageImages/kitchen.jpg')",
        }}
      />

      {/* OVERLAY */}
      <div className="absolute inset-0 bg-black/50" />

      {/* NAVBAR */}
      <nav className="absolute top-0 left-0 z-50 w-full">
        <div className="mx-auto flex h-20 items-center justify-between px-6 md:px-10">

          {/* Desktop Logo */}
          <div className="hidden md:flex">
            <div className="rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-2 shadow-lg">
              <h1 className="text-2xl font-semibold tracking-[0.2em] text-white">
                OSR Pros
              </h1>
            </div>
          </div>

          {/* Mobile Logo */}
          <div className="absolute left-1/2 -translate-x-1/2 md:hidden">
            <div className="rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 shadow-lg">
              <h1 className="text-xl font-semibold tracking-[0.2em] text-white">
                OSR Pros
              </h1>
            </div>
          </div>

          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="z-50 md:hidden"
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* HERO CONTENT */}
      <div className="relative z-10 flex h-full items-end">
        <div className="w-full px-6 pb-10 md:px-10 md:pb-14">

          {/* MOBILE */}
          <div className="flex flex-col gap-5 md:hidden">

            <h1 className="font-semibold leading-none tracking-tight">
              <span className="inline-block rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-1 text-5xl text-white shadow-lg">
                OSR
              </span>{" "}
              <span className="text-5xl text-white">Pros</span>
            </h1>

            <div className="space-y-3 max-w-xl">
              <p className="text-base text-white/85 leading-relaxed">
                We transform homes and businesses with high-end remodeling,
                precision craftsmanship, and modern design.
              </p>

              <p className="text-base text-white/70 leading-relaxed">
                From residential renovations to commercial spaces like salons,
                offices, decks, roofing, and interiors — we build spaces that elevate value.
              </p>

              {/* CTA MOBILE */}
              <div className="mt-6 flex flex-col gap-3">
                <a
                  href="sms:7043034112?&body=Hi%20OSR%20Pros,%20I%20am%20ready%20to%20start%20a%20project%20and%20would%20like%20a%20quote."
                  className="rounded-full bg-orange-500 px-6 py-3 text-center text-sm font-semibold text-white shadow-lg hover:bg-orange-600"
                >
                  Get Free Estimate
                </a>
              </div>
            </div>
          </div>

          {/* DESKTOP */}
          <div className="hidden items-end justify-between gap-12 md:flex">

            <h1 className="text-7xl lg:text-8xl font-semibold leading-none tracking-tight">
              <span className="inline-block rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-2 text-white shadow-[0_0_25px_rgba(249,115,22,0.35)]">
                OSR
              </span>{" "}
              <span className="text-white">Pros</span>
            </h1>

            <div className="max-w-xl space-y-4 pb-2">
              <p className="text-lg text-white/85 leading-relaxed">
                We transform homes and businesses with high-end remodeling,
                precision craftsmanship, and modern design.
              </p>

              <p className="text-lg text-white/70 leading-relaxed">
                From residential renovations to commercial spaces like salons,
                offices, decks, roofing, and interiors — we build spaces that elevate value.
              </p>

              {/* CTA DESKTOP */}
              <div className="mt-6 flex items-center gap-4">
                <a
                  href="sms:7043034112?&body=Hi%20OSR%20Pros,%20I%20am%20ready%20to%20start%20a%20project%20and%20would%20like%20a%20quote."
                  className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-orange-600"
                >
                  Get Free Estimate
                </a>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}