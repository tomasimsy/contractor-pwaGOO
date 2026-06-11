"use client";
import Link from "next/link";

export default function Footer() {
  return (
<footer className="w-full bg-[#080808] text-white">
  <div className="mx-auto max-w-7xl px-6 py-20 md:py-24 lg:px-16">

    {/* TOP GRID */}
    <div className="grid grid-cols-1 gap-14 md:grid-cols-12 md:gap-10">

      {/* BRAND */}
      <div className="md:col-span-5">
        <span className="text-[10px] font-medium uppercase tracking-[0.35em] text-white/30">
          Est. Charlotte, NC
        </span>
        <h2 className="mt-2 text-xl font-light tracking-[0.28em] text-white">
          OSR<span className="font-normal text-amber-400/90">PROS</span>
        </h2>

        <span className="mt-6 block h-px w-12 bg-gradient-to-r from-amber-500/60 to-transparent" />

        <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/50">
          Full-service remodeling contractor specializing in residential and
          commercial renovations — kitchens, bathrooms, flooring, salons,
          offices, decks, roofing, and full rebuilds.
        </p>

        <p className="mt-4 text-xs leading-relaxed text-white/30">
          Quality craftsmanship, durable builds, and modern design.
        </p>
      </div>

      {/* SERVICES */}
      <div className="md:col-span-3">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.25em] text-amber-400/60">
          Services
        </h3>

        <ul className="mt-6 space-y-3">
          {[
            "Home Renovation",
            "Business / Salon Remodeling",
            "Kitchen & Bathroom Remodeling",
            "Flooring Installation",
            "Decks & Outdoor Construction",
            "Roofing & Repairs",
            "Full Interior Buildouts",
          ].map((service) => (
            <li
              key={service}
              className="text-sm text-white/40 transition-colors hover:text-white/70"
            >
              {service}
            </li>
          ))}
        </ul>
      </div>

      {/* CONTACT / CTA */}
      <div className="md:col-span-4">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.25em] text-amber-400/60">
          Get a Free Estimate
        </h3>

        <p className="mt-6 text-sm leading-relaxed text-white/45">
          Text us anytime for a fast quote or project consultation.
          We respond quickly for residential and business remodeling jobs.
        </p>

        <a
          href="sms:7043034112?&body=Hi%20OSR%20Pros,%20I%20am%20ready%20to%20start%20a%20project%20and%20would%20like%20a%20quote."
          className="group relative mt-8 inline-block overflow-hidden bg-gradient-to-r from-amber-600 to-amber-700 px-8 py-4 text-[11px] font-medium uppercase tracking-[0.2em] text-white shadow-[0_8px_32px_rgba(180,83,9,0.15)] transition-all hover:shadow-[0_8px_40px_rgba(180,83,9,0.25)]"
        >
          <span className="relative z-10">Text for Estimate</span>
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        </a>

        <p className="mt-6 text-[10px] uppercase tracking-[0.15em] text-white/25">
          Fast response · Charlotte & surrounding areas
        </p>
      </div>
    </div>

    {/* BOTTOM BAR */}
    <div className="mt-16 flex flex-col gap-6 border-t border-white/5 pt-8 md:flex-row md:items-center md:justify-between">

      <p className="text-[11px] text-white/25">
        © {new Date().getFullYear()} OSR Pros. All rights reserved.
      </p>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-8">
        <p className="text-[10px] uppercase tracking-[0.12em] text-white/25">
          Home Remodeling · Business Renovation · Construction Services
        </p>

        <Link
          href="/installPWA"
          className="text-[10px] uppercase tracking-[0.15em] text-white/30 transition-colors hover:text-amber-400/70"
        >
          Install App
        </Link>
      </div>
    </div>
  </div>
</footer>
  );
}