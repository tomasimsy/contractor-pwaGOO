"use client";

import { EstimateCtaButton } from "./EstimateCta";

const SERVICES = [
  "Home Renovation",
  "Business / Salon Remodeling",
  "Kitchen & Bathroom Remodeling",
  "Flooring Installation",
  "Decks & Outdoor Construction",
  "Roofing & Repairs",
  "Full Interior Buildouts",
];

export function Footer() {
  return (
    <footer className="w-full bg-[#1C1410] text-white">
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-24 lg:px-16">
        <div className="grid grid-cols-1 gap-14 md:grid-cols-12 md:gap-10">
          {/* Brand */}
          <div className="md:col-span-5">
            <span className="font-[family-name:var(--font-landing-mono)] text-[10px] uppercase tracking-[0.35em] text-white/30">
              Est. Charlotte, NC
            </span>
            <h2 className="mt-2 font-[family-name:var(--font-landing-display)] text-2xl font-semibold tracking-tight text-white">
              OSR <span className="italic text-[#CB9A3E]">Pros</span>
            </h2>

            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/50">
              Full-service remodeling contractor specializing in residential
              and commercial renovations — kitchens, bathrooms, flooring,
              salons, offices, decks, roofing, and full rebuilds.
            </p>
          </div>

          {/* Services */}
          <div className="md:col-span-3">
            <h3 className="font-[family-name:var(--font-landing-mono)] text-[10px] uppercase tracking-[0.25em] text-[#CB9A3E]">
              Services
            </h3>
            <ul className="mt-6 space-y-3">
              {SERVICES.map((service) => (
                <li key={service} className="text-sm text-white/45 transition-colors hover:text-white/75">
                  {service}
                </li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <div className="md:col-span-4">
            <h3 className="font-[family-name:var(--font-landing-mono)] text-[10px] uppercase tracking-[0.25em] text-[#CB9A3E]">
              Get a Free Estimate
            </h3>
            <p className="mt-6 text-sm leading-relaxed text-white/45">
              Text us anytime for a fast quote or project consultation. We
              respond quickly for residential and business remodeling jobs.
            </p>
            <EstimateCtaButton className="mt-8 inline-block bg-[#CB9A3E] px-8 py-4 font-[family-name:var(--font-landing-mono)] text-[11px] font-bold uppercase tracking-[0.2em] text-[#1C1410] transition-colors hover:bg-white">
              Text for Estimate
            </EstimateCtaButton>
            <p className="mt-6 font-[family-name:var(--font-landing-mono)] text-[10px] uppercase tracking-[0.15em] text-white/25">
              Fast response · Charlotte &amp; surrounding areas
            </p>
          </div>
        </div>

        <div className="mt-16 border-t border-white/10 pt-8">
          <p className="text-[11px] text-white/25">© {new Date().getFullYear()} OSR Pros</p>
        </div>
      </div>
    </footer>
  );
}
