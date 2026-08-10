"use client";

import { EstimateCtaButton } from "./EstimateCta";

const services = [
  {
    title: "Kitchen Renovation",
    image:
      "https://images.unsplash.com/photo-1556911220-bff31c812dba?q=80&w=1200&auto=format&fit=crop",
    description:
      "Custom cabinetry, stone surfaces, and open-concept layouts designed for everyday living and lasting resale value.",
  },
  {
    title: "Bathroom Remodeling",
    image:
      "https://images.unsplash.com/photo-1507652313519-d4e9174996dd?q=80&w=1200&auto=format&fit=crop",
    description:
      "Spa-inspired retreats with premium fixtures, custom tile work, and thoughtful lighting for a calm, elevated daily ritual.",
  },
  {
    title: "Full Home Renovation",
    image:
      "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?q=80&w=1200&auto=format&fit=crop",
    description:
      "End-to-end transformations that unify every room — structural updates, refined finishes, and cohesive design throughout.",
  },
  {
    title: "Living Room Makeovers",
    image:
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?q=80&w=1200&auto=format&fit=crop",
    description:
      "Statement fireplaces, built-in storage, and layered lighting that turn your main gathering space into the heart of the home.",
  },
  {
    title: "Basement Finishing",
    image:
      "https://images.unsplash.com/photo-1505691723518-36a5ac3be353?q=80&w=1200&auto=format&fit=crop",
    description:
      "Unused square footage reimagined as entertainment lounges, guest suites, or home offices — fully permitted and finished to code.",
  },
  {
    title: "Flooring",
    image:
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=1200&auto=format&fit=crop",
    description:
      "Hardwood, tile, and luxury vinyl installed with precision — the foundation that ties your entire interior together.",
  },
];

export function Services() {
  return (
    <section id="work" className="w-full bg-[#F4F3EF] py-24 md:py-32">
      {/* Header — off-center, not the usual centered marketing block */}
      <div className="mx-auto mb-14 max-w-[1400px] px-6 md:mb-20 md:px-10 lg:px-16">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-5 font-[family-name:var(--font-landing-mono)] text-[11px] uppercase tracking-[0.3em] text-[#B23A1C]">
              Services Index
            </p>
            <h2 className="max-w-xl font-[family-name:var(--font-landing-display)] text-4xl font-semibold leading-[1.02] tracking-tight text-[#1C1410] md:text-5xl lg:text-6xl">
              Six ways we <span className="italic">rebuild</span> a space.
            </h2>
          </div>
          <EstimateCtaButton className="shrink-0 border-2 border-[#1C1410] px-7 py-3.5 font-[family-name:var(--font-landing-mono)] text-[11px] font-bold uppercase tracking-[0.2em] text-[#1C1410] transition-colors hover:bg-[#1C1410] hover:text-white">
            Start Your Project
          </EstimateCtaButton>
        </div>
      </div>

      {/* Spec-sheet index — numbered rows, not a photo-card grid */}
      <div className="mx-auto max-w-[1400px] border-t border-[#1C1410]/10 px-6 md:px-10 lg:px-16">
        {services.map((service, index) => (
          <div
            key={service.title}
            className="group grid grid-cols-1 items-center gap-6 border-b border-[#1C1410]/10 py-8 md:grid-cols-12 md:gap-10 md:py-10"
          >
            <span className="font-[family-name:var(--font-landing-mono)] text-sm text-[#1C1410]/30 md:col-span-1">
              {String(index + 1).padStart(2, "0")}
            </span>

            <h3 className="font-[family-name:var(--font-landing-display)] text-2xl font-medium leading-tight tracking-tight text-[#1C1410] md:col-span-4 md:text-3xl">
              {service.title}
            </h3>

            <p className="text-sm leading-relaxed text-[#1C1410]/55 md:col-span-4 md:text-[15px]">
              {service.description}
            </p>

            <div className="overflow-hidden md:col-span-3 md:justify-self-end">
              <div
                className="h-40 w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105 md:h-24 md:w-40"
                style={{ backgroundImage: `url('${service.image}')` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom CTA strip */}
      <div className="mx-auto mt-16 max-w-[1400px] px-6 text-center md:px-10 lg:px-16">
        <p className="font-[family-name:var(--font-landing-mono)] text-[11px] uppercase tracking-[0.2em] text-[#1C1410]/40">
          Ready to transform your space?
        </p>
        <EstimateCtaButton className="mt-5 inline-block font-[family-name:var(--font-landing-mono)] text-xs font-bold uppercase tracking-[0.2em] text-[#B23A1C] transition-colors hover:text-[#1C1410]">
          Get a Free Estimate →
        </EstimateCtaButton>
      </div>
    </section>
  );
}
