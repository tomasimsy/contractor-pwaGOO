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
    <section id="work" className="w-full bg-white py-24 md:py-28">
      <div className="mx-auto mb-14 max-w-[1400px] px-6 text-center md:mb-16 md:px-10 lg:px-16">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#4B6B4F]">Our Services</p>
        <h2 className="mx-auto max-w-2xl font-[family-name:var(--font-landing-display)] text-4xl font-medium leading-tight text-[#26231F] md:text-5xl">
          Every room, done <span className="italic">right</span>.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[#6E6659]">
          From a single room to a full rebuild — one crew, one point of contact, start to finish.
        </p>
      </div>

      {/* Photo-forward card grid — the standard pattern: the work is
          the pitch, cards aren't decorative chrome around it. */}
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-6 sm:grid-cols-2 md:px-10 lg:grid-cols-3 lg:px-16">
        {services.map((service) => (
          <div key={service.title} className="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition-shadow hover:shadow-lg">
            <div className="h-56 w-full overflow-hidden">
              <div
                className="h-full w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{ backgroundImage: `url('${service.image}')` }}
              />
            </div>
            <div className="p-6">
              <h3 className="font-[family-name:var(--font-landing-display)] text-xl font-medium text-[#26231F]">
                {service.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#6E6659]">{service.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-14 max-w-[1400px] px-6 text-center md:px-10 lg:px-16">
        <EstimateCtaButton className="rounded-full bg-[#24352B] px-8 py-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1A281F]">
          Start Your Project
        </EstimateCtaButton>
      </div>
    </section>
  );
}
