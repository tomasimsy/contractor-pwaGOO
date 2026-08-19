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
    <footer className="w-full bg-[#24352B] text-white">
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-24 lg:px-16">
        <div className="grid grid-cols-1 gap-14 md:grid-cols-12 md:gap-10">
          {/* Brand */}
          <div className="md:col-span-5">
            <h2 className="font-[family-name:var(--font-landing-display)] text-2xl font-medium tracking-tight text-white">
              OSR Pros
            </h2>
            <p className="mt-1 text-sm text-white/50">Charlotte, NC</p>

            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/60">
              Full-service remodeling contractor specializing in residential
              and commercial renovations — kitchens, bathrooms, flooring,
              salons, offices, decks, roofing, and full rebuilds.
            </p>

            {/* Domain links */}
            <div className="mt-6 flex flex-wrap gap-4 text-xs text-white/35">
              <a
                href="https://www.OneSquareRoof.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white/70 transition-colors"
              >
                OneSquareRoof.com
              </a>
              <span className="text-white/20">|</span>
              <a
                href="https://www.OSRPros.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white/70 transition-colors"
              >
                OSRPros.com
              </a>
            </div>
          </div>

          {/* Services */}
          <div className="md:col-span-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#A8C4A2]">
              Services
            </h3>
            <ul className="mt-6 space-y-3">
              {SERVICES.map((service) => (
                <li key={service} className="text-sm text-white/60 transition-colors hover:text-white/90">
                  {service}
                </li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <div className="md:col-span-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#A8C4A2]">
              Get a Free Estimate
            </h3>
            <p className="mt-6 text-sm leading-relaxed text-white/60">
              Text us anytime for a fast quote or project consultation. We
              respond quickly for residential and business remodeling jobs.
            </p>
            <EstimateCtaButton className="mt-8 inline-block rounded-full bg-[#4B6B4F] px-8 py-4 text-sm font-semibold text-white transition-colors hover:bg-[#3A5540]">
              Text for Estimate
            </EstimateCtaButton>
            <p className="mt-6 text-xs text-white/35">
              Fast response · Charlotte &amp; surrounding areas
            </p>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs text-white/35">
          <p>© {new Date().getFullYear()} OSR Pros</p>
          <div className="flex gap-4">
            <a
              href="https://www.OneSquareRoof.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/70 transition-colors"
            >
              OneSquareRoof.com
            </a>
            <span className="text-white/15">|</span>
            <a
              href="https://www.OSRPros.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/70 transition-colors"
            >
              OSRPros.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
