"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { EstimateCtaButton } from "./EstimateCta";

export function Hero({ isSignedIn = false }: { isSignedIn?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section className="relative w-full overflow-hidden bg-[#1C1410] text-white">
      {/* NAV */}
      <nav className="relative z-50 w-full">
        <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-6 md:px-10 lg:px-16">
          <div>
            <span className="block font-[family-name:var(--font-landing-mono)] text-[10px] uppercase tracking-[0.35em] text-white/40">
              Est. Charlotte, NC
            </span>
            <h1 className="mt-0.5 font-[family-name:var(--font-landing-display)] text-lg font-semibold tracking-tight text-white">
              OSR <span className="italic text-[#CB9A3E]">Pros</span>
            </h1>
          </div>

          <div className="hidden items-center gap-9 md:flex">
            <a
              href="#work"
              className="font-[family-name:var(--font-landing-mono)] text-[11px] uppercase tracking-[0.2em] text-white/60 transition-colors hover:text-white"
            >
              Work
            </a>
            <a
              href="#process"
              className="font-[family-name:var(--font-landing-mono)] text-[11px] uppercase tracking-[0.2em] text-white/60 transition-colors hover:text-white"
            >
              Process
            </a>
            <EstimateCtaButton className="flex items-center gap-1.5 border border-[#CB9A3E]/40 px-5 py-2.5 font-[family-name:var(--font-landing-mono)] text-[11px] uppercase tracking-[0.2em] text-[#CB9A3E] transition-colors hover:bg-[#CB9A3E] hover:text-[#1C1410]">
              Inquire <ArrowUpRight className="size-3.5" />
            </EstimateCtaButton>
            {/* Not in the previous app (that landing page lived on its
                own domain, separate from the product). Needed here:
                `/` is now the home page for EVERYONE, signed in or
                not — so this is the only way an authenticated visitor
                gets back into the app from the root URL. */}
            <Link
              href={isSignedIn ? "/dashboard" : "/login"}
              className="font-[family-name:var(--font-landing-mono)] text-[11px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white"
            >
              {isSignedIn ? "Dashboard" : "Sign In"}
            </Link>
          </div>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-white md:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/10 bg-[#1C1410] px-6 py-6 md:hidden">
            <div className="flex flex-col gap-5">
              <a href="#work" onClick={() => setMenuOpen(false)} className="font-[family-name:var(--font-landing-mono)] text-xs uppercase tracking-[0.2em] text-white/70">
                Work
              </a>
              <a href="#process" onClick={() => setMenuOpen(false)} className="font-[family-name:var(--font-landing-mono)] text-xs uppercase tracking-[0.2em] text-white/70">
                Process
              </a>
              <EstimateCtaButton className="w-fit border border-[#CB9A3E]/40 px-5 py-2.5 font-[family-name:var(--font-landing-mono)] text-[11px] uppercase tracking-[0.2em] text-[#CB9A3E]">
                Inquire
              </EstimateCtaButton>
            </div>
          </div>
        )}
      </nav>

      {/* SPLIT BODY — asymmetric, not a full-bleed hero photo */}
      <div className="relative mx-auto grid max-w-[1400px] grid-cols-1 gap-0 px-6 pb-16 pt-8 md:grid-cols-12 md:gap-10 md:px-10 md:pb-24 lg:px-16">
        {/* Left — headline block */}
        <div className="flex flex-col justify-center md:col-span-7 md:py-16">
          <p className="mb-7 font-[family-name:var(--font-landing-mono)] text-[11px] uppercase tracking-[0.3em] text-[#CB9A3E]">
            Home &amp; Commercial Remodeling
          </p>

          <h2 className="font-[family-name:var(--font-landing-display)] text-[15vw] font-semibold leading-[0.92] tracking-tight sm:text-6xl md:text-6xl lg:text-7xl xl:text-8xl">
            We rebuild
            <br />
            what you
            <br />
            <span className="italic text-[#CB9A3E]">actually</span> live in.
          </h2>

          <div className="mt-9 max-w-md space-y-4">
            <p className="text-lg leading-relaxed text-white/80">
              Remodeling done right with quality workmanship, thoughtful design, and a focus on what works for you.

            </p>
            <p className="text-sm leading-relaxed text-white/45">
              From kitchens and bathrooms to full renovations, salons, offices, flooring, decks, and more — serving Charlotte and the surrounding area.

            </p>
          </div>

          <div className="mt-9 flex flex-wrap items-center gap-6">
            <EstimateCtaButton className="group relative overflow-hidden bg-[#CB9A3E] px-8 py-4 font-[family-name:var(--font-landing-mono)] text-xs font-bold uppercase tracking-[0.2em] text-[#1C1410] transition-transform hover:-translate-y-0.5">
              Get a Free Estimate
            </EstimateCtaButton>
            <a
              href="#work"
              className="flex items-center gap-1.5 font-[family-name:var(--font-landing-mono)] text-xs uppercase tracking-[0.2em] text-white/60 transition-colors hover:text-white"
            >
              See the Work <ArrowUpRight className="size-3.5" />
            </a>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-2 font-[family-name:var(--font-landing-mono)] text-[10px] uppercase tracking-[0.15em] text-white/35">
            <span>Licensed &amp; Insured</span>
            <span className="hidden h-3 w-px bg-white/20 sm:block" />
            <span>Free Estimates</span>
            <span className="hidden h-3 w-px bg-white/20 sm:block" />
            <span>Local Crew</span>
          </div>
        </div>

        {/* Right — photo panel, framed rather than full-bleed */}
        <div className="relative mt-10 md:col-span-5 md:mt-0">
          <div className="relative h-[320px] w-full overflow-hidden sm:h-[440px] md:h-full md:min-h-[560px]">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: "url('/landingPageImages/kitchen.jpg')" }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1C1410]/70 via-transparent to-transparent" />
          </div>
          {/* Notch tag — breaks the rectangle. Honest, not a fabricated
              years-in-business stat: this is a new company, and the
              claim here is about attention, not tenure. */}
          <div className="absolute -bottom-5 -left-5 max-w-[220px] bg-[#CB9A3E] px-5 py-4 sm:-bottom-6 sm:-left-6">
            <span className="font-[family-name:var(--font-landing-display)] text-lg font-semibold leading-snug text-[#1C1410]">
              Nothing to coast on.
            </span>
            <span className="mt-1.5 block font-[family-name:var(--font-landing-mono)] text-[10px] uppercase leading-tight tracking-[0.1em] text-[#1C1410]/70">
              Every job earns the next one
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
