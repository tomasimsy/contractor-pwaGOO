"use client";

import { EstimateCtaButton } from "@/components/LandingPage/EstimateCta";
export default function ServicesSection() {
const services = [
  {
    title: "Kitchen Renovation",
    image:
      "https://images.unsplash.com/photo-1556911220-bff31c812dba?q=80&w=1600&auto=format&fit=crop",
    description:
      "Custom cabinetry, stone surfaces, and open-concept layouts designed for everyday living and lasting resale value.",
  },
  {
    title: "Bathroom Remodeling",
    image:
      "https://images.unsplash.com/photo-1507652313519-d4e9174996dd?q=80&w=1600&auto=format&fit=crop",
    description:
      "Spa-inspired retreats with premium fixtures, custom tile work, and thoughtful lighting for a calm, elevated daily ritual.",
  },
  {
    title: "Full Home Renovation",
    image:
      "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?q=80&w=1600&auto=format&fit=crop",
    description:
      "End-to-end transformations that unify every room — structural updates, refined finishes, and cohesive design throughout.",
  },
  {
    title: "Living Room Makeovers",
    image:
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?q=80&w=1600&auto=format&fit=crop",
    description:
      "Statement fireplaces, built-in storage, and layered lighting that turn your main gathering space into the heart of the home.",
  },
  {
    title: "Basement Finishing",
    image:
      "https://images.unsplash.com/photo-1505691723518-36a5ac3be353?q=80&w=1600&auto=format&fit=crop",
    description:
      "Unused square footage reimagined as entertainment lounges, guest suites, or home offices — fully permitted and finished to code.",
  },
  {
    title: "Flooring",
    image:
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=1600&auto=format&fit=crop",
    description:
      "Hardwood, tile, and luxury vinyl installed with precision — the foundation that ties your entire interior together.",
  },
];

return (
<section id="portfolio" className="w-full bg-[#f5f2ed] py-24 md:py-32">
  {/* Header */}
  <div className="mx-auto mb-16 max-w-6xl px-6 text-center md:mb-20 lg:px-16">
    {/* Eyebrow */}
    <div className="mb-6 flex items-center justify-center gap-4">
      <span className="h-px w-10 bg-gradient-to-r from-transparent to-amber-600/60" />
      <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-amber-700/70">
        Our Portfolio
      </p>
      <span className="h-px w-10 bg-gradient-to-l from-transparent to-amber-600/60" />
    </div>

    <h2 className="font-light tracking-tight text-[#1a1a1a]">
      <span className="block text-3xl md:text-5xl lg:text-6xl">
        Transformations
      </span>
      <span className="mt-2 block text-3xl text-[#1a1a1a]/40 md:text-5xl lg:text-6xl">
        We've Delivered
      </span>
    </h2>

    <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#1a1a1a]/50 md:text-lg">
      From full renovations to detailed interior upgrades, we turn outdated
      spaces into modern, functional, and high-value environments.
    </p>

    <EstimateCtaButton
      className="group relative mt-10 inline-block overflow-hidden bg-[#1a1a1a] px-10 py-4 text-[11px] font-medium uppercase tracking-[0.2em] text-white transition-all hover:bg-[#2a2a2a]"
    >
      <span className="relative z-10">Start Your Project</span>
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
    </EstimateCtaButton>
  </div>

  {/* Services Grid */}
  <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 md:grid-cols-2 md:gap-8 lg:grid-cols-3 lg:px-16">
    {services.map((service, index) => (
      <div
        key={index}
        className="group relative cursor-pointer overflow-hidden bg-[#1a1a1a]"
      >
        {/* Image */}
        <div
          className="h-[22rem] w-full bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105 md:h-80 lg:h-[26rem]"
          style={{ backgroundImage: `url('${service.image}')` }}
        />

        {/* Overlay — deepens on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/5 transition-opacity duration-500 group-hover:from-black/90" />

        {/* Index number — editorial detail */}
        <span className="absolute right-5 top-5 text-[10px] font-medium uppercase tracking-[0.2em] text-white/30 transition-colors duration-500 group-hover:text-amber-400/60">
          {String(index + 1).padStart(2, "0")}
        </span>

        {/* Content */}
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
          {/* Accent line */}
          <span className="mb-4 block h-px w-8 bg-amber-500/60 transition-all duration-500 group-hover:w-16" />

          <h3 className="text-xl font-light tracking-wide text-white md:text-2xl">
            {service.title}
          </h3>

          {/* Optional — show if service.description exists */}
          {service.description && (
            <p className="mt-3 max-h-0 overflow-hidden text-sm leading-relaxed text-white/60 opacity-0 transition-all duration-500 group-hover:max-h-24 group-hover:opacity-100">
              {service.description}
            </p>
          )}

          <span className="mt-4 inline-block text-[10px] font-medium uppercase tracking-[0.2em] text-white/40 transition-colors duration-500 group-hover:text-amber-400/80">
            {/* Project → */}
            Project
          </span>
        </div>
      </div>
    ))}
  </div>

  {/* Bottom CTA strip */}
  <div className="mx-auto mt-20 max-w-7xl border-t border-[#1a1a1a]/10 px-6 pt-16 text-center lg:px-16">
    <p className="text-sm uppercase tracking-[0.2em] text-[#1a1a1a]/40">
      Ready to transform your space?
    </p>
    <EstimateCtaButton
      className="mt-6 inline-block text-xs font-medium uppercase tracking-[0.2em] text-amber-700 transition-colors hover:text-amber-800"
    >
      Get a Free Estimate →
    </EstimateCtaButton>
  </div>
</section>
);
}