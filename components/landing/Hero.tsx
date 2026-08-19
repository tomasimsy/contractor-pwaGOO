"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";
import { EstimateCtaButton } from "./EstimateCta";

export function Hero({ isSignedIn = false }: { isSignedIn?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section className="relative w-full overflow-hidden">
      {/* NAV — floats over the photo, on a dark gradient for contrast.
          The standard pattern: no separate colored nav bar, just enough
          overlay to keep white text legible over any photo. */}
      <nav className="absolute inset-x-0 top-0 z-50 w-full">
        <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-6 md:px-10 lg:px-16">
          <h1 className="font-[family-name:var(--font-landing-display)] text-2xl font-semibold tracking-tight text-white">
            OSR Pros
          </h1>

          <div className="hidden items-center gap-8 md:flex">
            <a href="#work" className="text-sm font-medium text-white/90 transition-colors hover:text-white">
              Our Work
            </a>
            <a href="#process" className="text-sm font-medium text-white/90 transition-colors hover:text-white">
              Process
            </a>
            <Link
              href={isSignedIn ? "/dashboard" : "/login"}
              className="text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              {isSignedIn ? "Dashboard" : "Sign In"}
            </Link>
            <EstimateCtaButton className="rounded-full bg-[#4B6B4F] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/10 transition-colors hover:bg-[#3A5540]">
              Get a Free Estimate
            </EstimateCtaButton>
          </div>

          <button onClick={() => setMenuOpen(!menuOpen)} className="text-white md:hidden" aria-label="Toggle menu">
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/10 bg-[#24352B] px-6 py-6 md:hidden">
            <div className="flex flex-col gap-5">
              <a href="#work" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-white/90">
                Our Work
              </a>
              <a href="#process" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-white/90">
                Process
              </a>
              <Link
                href={isSignedIn ? "/dashboard" : "/login"}
                onClick={() => setMenuOpen(false)}
                className="text-sm font-medium text-white/70"
              >
                {isSignedIn ? "Dashboard" : "Sign In"}
              </Link>
              <EstimateCtaButton className="w-fit rounded-full bg-[#4B6B4F] px-6 py-2.5 text-sm font-semibold text-white">
                Get a Free Estimate
              </EstimateCtaButton>
            </div>
          </div>
        )}
      </nav>

      {/* FULL-BLEED PHOTO HERO — the standard pattern for this
          category: the work itself is the opening statement, not an
          abstract layout device. */}
      <div className="relative h-[640px] w-full sm:h-[720px] md:h-[820px]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/landingPageImages/kitchen.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/40" />

        <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
            Charlotte, NC · Home &amp; Commercial Remodeling
          </p>
          <h2 className="max-w-3xl font-[family-name:var(--font-landing-display)] text-5xl font-medium leading-[1.08] text-white sm:text-6xl md:text-7xl">
            Remodeling done right, <span className="italic text-[#A8C4A2]">start to finish</span>.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/85">
            Quality workmanship and thoughtful design for kitchens, bathrooms, full renovations, and more — built around how you actually live.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <EstimateCtaButton className="rounded-full bg-[#4B6B4F] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 hover:bg-[#3A5540]">
              Get a Free Estimate
            </EstimateCtaButton>
            <a
              href="#work"
              className="flex items-center gap-1.5 rounded-full border border-white/40 px-8 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              See Our Work <ArrowRight className="size-4" />
            </a>
          </div>
        </div>

        {/* Trust badges — a real convention in this category, visible
            without scrolling, anchored to the bottom of the hero. */}
        <div className="absolute inset-x-0 bottom-0 border-t border-white/15 bg-black/25 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 py-5 text-sm font-medium text-white/90 md:justify-between md:px-10 lg:px-16">
            <span>Free Estimates</span>
            <span>Local Charlotte Crew</span>
            <span>Written Scope &amp; Pricing</span>
          </div>
        </div>
      </div>
    </section>
  );
}
