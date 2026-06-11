"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function HeroSection() {
const [menuOpen, setMenuOpen] = useState(false);

return (

<section className="container-fluid relative h-screen w-full overflow-hidden bg-[#080808] text-white">

  {/* BACKGROUND — subtle scale for depth */}
  <div className="absolute inset-0">
    <div
      className="absolute inset-0 scale-[1.03] bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/landingPageImages/kitchen.jpg')" }}
    />
  </div>

  {/* LUXURY OVERLAY — vignette + warm undertone */}
  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/25" />
  <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-transparent" />
  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.45)_100%)]" />

  {/* NAVBAR */}
  <nav className="absolute top-0 left-0 z-50 w-full border-b border-white/5 backdrop-blur-[2px]">
    <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 md:px-10 lg:px-16">

      {/* Desktop Logo — refined wordmark, no pill */}
      <div className="hidden md:block">
        <span className="text-[11px] font-medium uppercase tracking-[0.35em] text-white/50">
          Est. Charlotte, NC
        </span>
        <h1 className="mt-1 text-xl font-light tracking-[0.28em] text-white">
          OSR<span className="font-normal text-amber-400/90">PROS</span>
        </h1>
      </div>

      {/* Mobile Logo */}
      <div className="absolute left-1/2 -translate-x-1/2 md:hidden">
        <h1 className="text-lg font-light tracking-[0.25em] text-white">
          OSR<span className="font-normal text-amber-400/90">PROS</span>
        </h1>
      </div>

      {/* Desktop nav links — optional, adds luxury feel */}
      <div className="hidden items-center gap-10 md:flex">
        <a href="#services" className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/60 transition-colors hover:text-white">
          Services
        </a>
        <a href="#portfolio" className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/60 transition-colors hover:text-white">
          Portfolio
        </a>
        <a
          href="sms:7043034112?&body=Hi%20OSR%20Pros,%20I%20am%20ready%20to%20start%20a%20project%20and%20would%20like%20a%20quote."
          className="border border-white/20 px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white transition-all hover:border-amber-400/50 hover:bg-white/5"
        >
          Inquire
        </a>
      </div>

      {/* Hamburger */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="z-50 text-white/80 transition-colors hover:text-white md:hidden"
        aria-label="Toggle menu"
      >
        {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
    </div>
  </nav>

  {/* HERO CONTENT */}
  <div className="relative z-10 flex h-full items-end">
    <div className="mx-auto w-full max-w-7xl px-6 pb-32 md:px-10 md:pb-36 lg:px-16">

      {/* MOBILE */}
      <div className="flex flex-col gap-8 md:hidden">

        {/* Eyebrow — luxury brands lead with context, not logo repeat */}
        <div className="flex items-center gap-4">
          <span className="h-px w-8 bg-gradient-to-r from-amber-500/80 to-transparent" />
          <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-amber-400/80">
            Premium Remodeling
          </p>
        </div>

        <h2 className="font-light leading-[1.05] tracking-tight">
          <span className="block text-4xl text-white/95">
            Crafted Spaces.
          </span>
          <span className="mt-1 block text-4xl text-white/60">
            Lasting Value.
          </span>
        </h2>

        <div className="max-w-sm space-y-4 border-l border-white/10 pl-5">
          <p className="text-[15px] leading-relaxed text-white/80">
            We transform homes and businesses with high-end remodeling,
            precision craftsmanship, and modern design.
          </p>
          <p className="text-sm leading-relaxed text-white/50">
            Residential renovations to commercial spaces — salons, offices,
            decks, roofing, and interiors.
          </p>
        </div>

        {/* Trust strip — social proof above CTA */}
        <div className="flex items-center gap-6 text-[10px] uppercase tracking-[0.15em] text-white/40">
          <span>Licensed & Insured</span>
          <span className="h-3 w-px bg-white/20" />
          <span>Free Estimates</span>
        </div>

        {/* CTA MOBILE */}
        <div className="flex flex-col gap-3">
          <a
            href="sms:7043034112?&body=Hi%20OSR%20Pros,%20I%20am%20ready%20to%20start%20a%20project%20and%20would%20like%20a%20quote."
            className="group relative overflow-hidden bg-gradient-to-r from-amber-600 to-amber-700 px-8 py-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-white shadow-[0_8px_32px_rgba(180,83,9,0.25)] transition-all hover:shadow-[0_8px_40px_rgba(180,83,9,0.35)]"
          >
            <span className="relative z-10">Get Free Estimate</span>
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </a>
          <a
            href="#portfolio"
            className="px-8 py-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-white/60 transition-colors hover:text-white"
          >
            View Our Work →
          </a>
        </div>
      </div>

      {/* DESKTOP */}
      <div className="hidden md:grid md:grid-cols-12 md:items-end md:gap-8 lg:gap-16">

        {/* Left — headline block (editorial layout) */}
        <div className="col-span-7 lg:col-span-6">
          <div className="mb-6 flex items-center gap-5">
            <span className="h-px w-12 bg-gradient-to-r from-amber-500/80 to-transparent" />
            <p className="text-[11px] font-medium uppercase tracking-[0.35em] text-amber-400/80">
              Charlotte's Premier Remodeling Atelier
            </p>
          </div>

          <h2 className="font-light leading-[0.95] tracking-tight">
            <span className="block text-6xl text-white/95 lg:text-7xl xl:text-8xl">
              Crafted
            </span>
            <span className="mt-2 block text-6xl text-white/95 lg:text-7xl xl:text-8xl">
              Spaces.
            </span>
            <span className="mt-4 block text-5xl text-white/40 lg:text-6xl xl:text-7xl">
              Lasting Value.
            </span>
          </h2>
        </div>

        {/* Right — copy + CTA */}
        <div className="col-span-5 lg:col-span-6">
          <div className="ml-auto max-w-md space-y-6 border-l border-white/10 pl-8 lg:pl-10">

            <p className="text-lg leading-relaxed text-white/80">
              We transform homes and businesses with high-end remodeling,
              precision craftsmanship, and modern design.
            </p>

            <p className="text-base leading-relaxed text-white/45">
              From residential renovations to commercial spaces like salons,
              offices, decks, roofing, and interiors — we build spaces that elevate value.
            </p>

            {/* Trust signals */}
            <div className="flex items-center gap-8 pt-2 text-[10px] uppercase tracking-[0.18em] text-white/35">
              <span>Licensed & Insured</span>
              <span className="h-3 w-px bg-white/15" />
              <span>Free Estimates</span>
              <span className="h-3 w-px bg-white/15" />
              <span>Local Experts</span>
            </div>

            {/* CTA DESKTOP */}
            <div className="flex items-center gap-5 pt-4">
              <a
                href="sms:7043034112?&body=Hi%20OSR%20Pros,%20I%20am%20ready%20to%20start%20a%20project%20and%20would%20like%20a%20quote."
                className="group relative overflow-hidden bg-gradient-to-r from-amber-600 to-amber-700 px-8 py-4 text-xs font-medium uppercase tracking-[0.2em] text-white shadow-[0_8px_32px_rgba(180,83,9,0.2)] transition-all hover:shadow-[0_8px_40px_rgba(180,83,9,0.35)]"
              >
                <span className="relative z-10">Get Free Estimate</span>
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              </a>
              <a
                href="#portfolio"
                className="text-xs font-medium uppercase tracking-[0.2em] text-white/50 transition-colors hover:text-white"
              >
                View Our Work →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  {/* Scroll indicator — subtle luxury cue */}
  <div className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-3 md:flex">
    <span className="text-[9px] uppercase tracking-[0.3em] text-white/30">Scroll</span>
    <span className="h-10 w-px bg-gradient-to-b from-white/30 to-transparent" />
  </div>
</section>


);
}